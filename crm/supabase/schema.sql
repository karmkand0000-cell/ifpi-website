-- =====================================================================
-- IFPI CRM — Supabase database schema
-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.
-- Safe to re-run: it drops and recreates policies, keeps your data.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Team members (one row per login)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  role        text not null default 'counsellor' check (role in ('admin','counsellor')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- The first person to sign up becomes an active admin. Everyone after that
-- joins as an INACTIVE counsellor until an admin approves them in Team.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when (select count(*) from public.profiles) = 0 then 'admin' else 'counsellor' end,
    (select count(*) from public.profiles) = 0
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

-- ---------------------------------------------------------------------
-- Courses and batches
-- ---------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  code        text,
  name        text not null,
  category    text not null default 'NISM Certification',
  fee         numeric(10,2),
  duration    text,
  mode        text default 'Online + Offline',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.batches (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid references public.courses(id) on delete cascade,
  name        text not null,
  start_date  date,
  schedule    text,
  mode        text default 'Online',
  seats       int,
  status      text not null default 'Upcoming' check (status in ('Upcoming','Running','Completed','Cancelled')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Leads (enquiries -> students)
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null,
  email         text,
  city          text,
  course_id     uuid references public.courses(id) on delete set null,
  batch_id      uuid references public.batches(id) on delete set null,
  source        text default 'Other',
  campaign      text,
  stage         text not null default 'New',
  priority      text not null default 'Warm' check (priority in ('Hot','Warm','Cold')),
  owner_id      uuid references public.profiles(id) on delete set null,
  follow_up_on  date,
  fee_quoted    numeric(10,2),
  lost_reason   text,
  notes         text,
  enrolled_on   date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists leads_phone_key on public.leads (phone);
create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_follow_idx on public.leads (follow_up_on);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Activity timeline, payments, message templates
-- ---------------------------------------------------------------------
create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  type        text not null default 'note' check (type in ('note','call','whatsapp','email','stage','payment','followup','system')),
  body        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists activities_lead_idx on public.activities (lead_id, created_at desc);

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  mode        text not null default 'UPI',
  reference   text,
  paid_on     date not null default current_date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists payments_lead_idx on public.payments (lead_id);

create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  channel     text not null default 'whatsapp',
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Row level security
--   Admins see and change everything.
--   Counsellors see leads assigned to them plus unassigned leads.
--   The public enquiry form (anon) can only INSERT a new lead.
-- ---------------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.courses    enable row level security;
alter table public.batches    enable row level security;
alter table public.leads      enable row level security;
alter table public.activities enable row level security;
alter table public.payments   enable row level security;
alter table public.templates  enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles','courses','batches','leads','activities','payments','templates')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- profiles
create policy "staff read team"     on public.profiles for select using (public.is_staff() or id = auth.uid());
create policy "update own profile"  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admin manage team"   on public.profiles for update using (public.is_admin());

-- Only admins may change anyone's role or active status.
create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the Supabase SQL editor, so the owner can always fix roles there.
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles or deactivate team members';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- courses & batches: everyone signed in reads, admins edit; public form reads active courses
create policy "public read courses" on public.courses for select using (active or public.is_staff());
create policy "admin write courses" on public.courses for all using (public.is_admin()) with check (public.is_admin());
create policy "staff read batches"  on public.batches for select using (public.is_staff());
create policy "admin write batches" on public.batches for all using (public.is_admin()) with check (public.is_admin());

-- leads
create policy "staff read leads" on public.leads for select
  using (public.is_admin() or (public.is_staff() and (owner_id = auth.uid() or owner_id is null)));
create policy "staff add leads" on public.leads for insert to authenticated
  with check (public.is_staff());
create policy "staff edit leads" on public.leads for update
  using (public.is_admin() or (public.is_staff() and (owner_id = auth.uid() or owner_id is null)))
  with check (public.is_admin() or (public.is_staff() and (owner_id = auth.uid() or owner_id is null)));
create policy "admin delete leads" on public.leads for delete using (public.is_admin());
create policy "public enquiry form" on public.leads for insert to anon
  with check (stage = 'New' and owner_id is null and created_by is null and fee_quoted is null and enrolled_on is null);

-- activities & payments follow the lead they belong to
create policy "staff read activities" on public.activities for select
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy "staff add activities" on public.activities for insert to authenticated
  with check (public.is_staff() and exists (select 1 from public.leads l where l.id = lead_id));
create policy "admin delete activities" on public.activities for delete using (public.is_admin());

create policy "staff read payments" on public.payments for select
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy "staff add payments" on public.payments for insert to authenticated
  with check (public.is_staff() and exists (select 1 from public.leads l where l.id = lead_id));
create policy "admin edit payments" on public.payments for update using (public.is_admin());
create policy "admin delete payments" on public.payments for delete using (public.is_admin());

-- templates
create policy "staff read templates"  on public.templates for select using (public.is_staff());
create policy "staff write templates" on public.templates for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- Starter data (only inserted when the tables are empty)
-- Fees are left blank on purpose: fill in your own in Courses & Batches.
-- ---------------------------------------------------------------------
insert into public.courses (code, name, category, duration)
select * from (values
  ('NISM-I',      'NISM Series I: Currency Derivatives',                          'NISM Certification', ''),
  ('NISM-II-A',   'NISM Series II-A: Registrar & Transfer Agents (Corporate)',    'NISM Certification', ''),
  ('NISM-II-B',   'NISM Series II-B: Registrar & Transfer Agents (Mutual Fund)',  'NISM Certification', ''),
  ('NISM-III-A',  'NISM Series III-A: Securities Intermediaries Compliance',      'NISM Certification', ''),
  ('NISM-IV',     'NISM Series IV: Interest Rate Derivatives',                    'NISM Certification', ''),
  ('NISM-V-A',    'NISM Series V-A: Mutual Fund Distributors',                    'NISM Certification', ''),
  ('NISM-VI',     'NISM Series VI: Depository Operations',                        'NISM Certification', ''),
  ('NISM-VII',    'NISM Series VII: Securities Operations & Risk Management',     'NISM Certification', ''),
  ('NISM-VIII',   'NISM Series VIII: Equity Derivatives',                         'NISM Certification', ''),
  ('NISM-X-A',    'NISM Series X-A: Investment Adviser (Level 1)',                'NISM Certification', ''),
  ('NISM-X-B',    'NISM Series X-B: Investment Adviser (Level 2)',                'NISM Certification', ''),
  ('NISM-XII',    'NISM Series XII: Securities Markets Foundation',               'NISM Certification', ''),
  ('NISM-XIII',   'NISM Series XIII: Common Derivatives',                         'NISM Certification', ''),
  ('NISM-XV',     'NISM Series XV: Research Analyst',                             'NISM Certification', ''),
  ('NISM-XVI',    'NISM Series XVI: Commodity Derivatives',                       'NISM Certification', ''),
  ('NISM-XVII',   'NISM Series XVII: Retirement Adviser',                         'NISM Certification', ''),
  ('NISM-XIX-A',  'NISM Series XIX-A: Alternative Investment Fund Managers',      'NISM Certification', ''),
  ('NISM-XXI-A',  'NISM Series XXI-A: Portfolio Managers Distributors',           'NISM Certification', ''),
  ('NISM-XXI-B',  'NISM Series XXI-B: Portfolio Managers',                        'NISM Certification', ''),
  ('CFP',         'CFP (Certified Financial Planner) Preparation',                'Global Certification', ''),
  ('TA',          'Technical Analysis Masterclass',                               'Trading', ''),
  ('OPT',         'Options & Derivatives Programme',                              'Trading', ''),
  ('ALGO',        'Algo Trading',                                                 'Trading', ''),
  ('FOREX',       'Forex Trading',                                                'Trading', ''),
  ('CRYPTO',      'Crypto Trading',                                               'Trading', ''),
  ('FPI',         'Financial Planning & Investment',                              'Wealth Management', ''),
  ('FA',          'Fundamental Analysis',                                         'Investment', ''),
  ('ER',          'Equity Research',                                              'Research & Advisory', ''),
  ('FLF',         'Financial Literacy Foundation',                                'Foundation', ''),
  ('SMB',         'Stock Market Basics',                                          'Foundation', '')
) v(code, name, category, duration)
where not exists (select 1 from public.courses);

insert into public.templates (name, body)
select * from (values
  ('Welcome',              'Namaste {name}, thank you for your enquiry with {institute}. You asked about {course}. Shall I share the course details, fees and next batch timings?'),
  ('Course details',       'Hi {name}, here are the details for {course}: duration, batch timings, exam preparation and mock tests. When is a good time for a quick call? - {counsellor}, {institute}'),
  ('Demo class reminder',  'Hi {name}, a reminder that your free demo class is on {date}. Please join 5 minutes early. Reply here if you have any questions. - {counsellor}, {institute}'),
  ('No reply follow-up',   'Hi {name}, do you have any questions about {course}? Seats in the next batch are limited. Reply with a convenient time and we will call you.'),
  ('Fee reminder',         'Hi {name}, the last date to pay the fee for {course} ({batch}) is {date}. Balance due: {balance}. Message me for UPI or EMI options. - {counsellor}'),
  ('Admission confirmed',  'Congratulations {name}! Your admission to {course} ({batch}) is confirmed. The schedule and study material will be shared shortly. Welcome to {institute}.')
) v(name, body)
where not exists (select 1 from public.templates);
