// Data layer. Talks to Supabase when keys are set in config.js,
// otherwise to an in-browser demo store with sample data.
import { CONFIG } from "./config.js";

export const LIVE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
let sb = null;

export async function initBackend() {
  if (LIVE) {
    const { createClient } = await import(SUPABASE_ESM);
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } else {
    demo.load();
  }
}

export function supabaseClient() { return sb; }

function friendly(error) {
  if (!error) return null;
  const code = error.code || "";
  let msg = error.message || "Something went wrong";
  if (code === "23505") msg = "A lead with this phone number already exists.";
  else if (code === "42501" || /row-level security/i.test(msg)) msg = "You don't have permission to do that. Ask an admin.";
  else if (/Invalid login credentials/i.test(msg)) msg = "Email or password is incorrect.";
  else if (/Failed to fetch/i.test(msg)) msg = "Can't reach the server. Check your internet connection.";
  const e = new Error(msg); e.code = code; return e;
}

// ---------------------------------------------------------------- auth
export const auth = {
  async session() {
    if (!LIVE) return { user: { id: demo.data.me, email: "admin@demo.ifpi" } };
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  async signIn(email, password) {
    if (!LIVE) return;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw friendly(error);
  },
  async signUp(email, password, fullName) {
    if (!LIVE) return;
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw friendly(error);
    return data;
  },
  async resetPassword(email) {
    if (!LIVE) return;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw friendly(error);
  },
  async updatePassword(password) {
    if (!LIVE) return;
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw friendly(error);
  },
  async signOut() {
    if (!LIVE) { demo.reset(); return; }
    await sb.auth.signOut();
  },
  onChange(cb) {
    if (!LIVE) return;
    sb.auth.onAuthStateChange((event, session) => cb(event, session));
  },
};

// ---------------------------------------------------------------- CRUD
// opts: { eq: {col: value}, order: ["col", "asc"|"desc"], limit: n }
export const db = {
  async select(table, opts = {}) {
    if (!LIVE) return demo.select(table, opts);
    const page = 1000, out = [];
    for (let from = 0; ; from += page) {
      let q = sb.from(table).select("*");
      for (const [k, v] of Object.entries(opts.eq || {})) q = q.eq(k, v);
      if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] !== "desc" });
      const to = opts.limit ? Math.min(from + page, opts.limit) - 1 : from + page - 1;
      const { data, error } = await q.range(from, to);
      if (error) throw friendly(error);
      out.push(...data);
      if (data.length < page || (opts.limit && out.length >= opts.limit)) break;
    }
    return out;
  },
  async insert(table, rows) {
    const many = Array.isArray(rows);
    if (!LIVE) return demo.insert(table, many ? rows : [rows]).then(r => many ? r : r[0]);
    const { data, error } = await sb.from(table).insert(many ? rows : [rows]).select();
    if (error) throw friendly(error);
    return many ? data : data[0];
  },
  async update(table, id, patch) {
    if (!LIVE) return demo.update(table, id, patch);
    const { data, error } = await sb.from(table).update(patch).eq("id", id).select();
    if (error) throw friendly(error);
    if (!data.length) throw new Error("You don't have permission to change this record.");
    return data[0];
  },
  async remove(table, id) {
    if (!LIVE) return demo.remove(table, id);
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw friendly(error);
  },
};

// Public enquiry form: insert without reading back (anon can't read leads).
export async function submitEnquiry(row) {
  if (!LIVE) { await demo.insert("leads", [row]); return; }
  const { error } = await sb.from("leads").insert([row]);
  if (error) throw friendly(error);
}
export async function publicCourses() {
  if (!LIVE) return demo.select("courses", { eq: { active: true }, order: ["name", "asc"] });
  const { data, error } = await sb.from("courses").select("id,name,category").eq("active", true).order("name");
  if (error) throw friendly(error);
  return data;
}

// ---------------------------------------------------------------- demo store
const KEY = "ifpi-crm-demo-v1";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const iso = d => d.toISOString();
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };

const demo = {
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(KEY)); } catch { this.data = null; }
    if (!this.data || !this.data.leads) this.data = seed();
    (this.data.profiles || []).forEach(p => { if (p.full_name === "Demo Admin") p.full_name = "Admin"; });
    this.save();
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ } },
  reset() { try { localStorage.removeItem(KEY); } catch {} this.data = seed(); this.save(); },
  async select(table, opts) {
    let rows = (this.data[table] || []).slice();
    for (const [k, v] of Object.entries(opts.eq || {})) rows = rows.filter(r => r[k] === v);
    if (opts.order) {
      const [c, dir] = opts.order, s = dir === "desc" ? -1 : 1;
      rows.sort((a, b) => (a[c] ?? "") > (b[c] ?? "") ? s : (a[c] ?? "") < (b[c] ?? "") ? -s : 0);
    }
    if (opts.limit) rows = rows.slice(0, opts.limit);
    return structuredClone(rows);
  },
  async insert(table, rows) {
    const list = this.data[table] ||= [];
    const out = rows.map(r => {
      if (table === "leads" && list.some(l => l.phone === r.phone)) throw friendly({ code: "23505", message: "dup" });
      const now = iso(new Date());
      const row = { id: uid(), created_at: now, ...(table === "leads" ? { updated_at: now, stage: "New", priority: "Warm" } : {}), ...r };
      list.push(row); return row;
    });
    this.save(); return structuredClone(out);
  },
  async update(table, id, patch) {
    const row = (this.data[table] || []).find(r => r.id === id);
    if (!row) throw new Error("Record not found");
    if (table === "leads" && patch.phone && patch.phone !== row.phone && this.data.leads.some(l => l.phone === patch.phone))
      throw friendly({ code: "23505", message: "dup" });
    Object.assign(row, patch, table === "leads" ? { updated_at: iso(new Date()) } : {});
    this.save(); return structuredClone(row);
  },
  async remove(table, id) {
    this.data[table] = (this.data[table] || []).filter(r => r.id !== id);
    if (table === "leads") {
      this.data.activities = this.data.activities.filter(a => a.lead_id !== id);
      this.data.payments = this.data.payments.filter(p => p.lead_id !== id);
    }
    this.save();
  },
};

function seed() {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const me = "demo-admin", c1 = "demo-c1", c2 = "demo-c2";
  const profiles = [
    { id: me, full_name: "Admin", email: "admin@demo.ifpi", role: "admin", active: true, created_at: iso(new Date()) },
    { id: c1, full_name: "Counsellor Asha", email: "asha@demo.ifpi", role: "counsellor", active: true, created_at: iso(new Date()) },
    { id: c2, full_name: "Counsellor Vikram", email: "vikram@demo.ifpi", role: "counsellor", active: true, created_at: iso(new Date()) },
  ];
  const courseRows = [
    ["NISM-V-A", "NISM Series V-A: Mutual Fund Distributors", "NISM Certification"],
    ["NISM-VIII", "NISM Series VIII: Equity Derivatives", "NISM Certification"],
    ["NISM-XV", "NISM Series XV: Research Analyst", "NISM Certification"],
    ["NISM-X-A", "NISM Series X-A: Investment Adviser (Level 1)", "NISM Certification"],
    ["NISM-X-B", "NISM Series X-B: Investment Adviser (Level 2)", "NISM Certification"],
    ["NISM-VII", "NISM Series VII: Securities Operations & Risk Management", "NISM Certification"],
    ["FPI", "Financial Planning & Investment", "Wealth Management"],
    ["TA", "Technical Analysis Masterclass", "Trading"],
    ["OPT", "Options & Derivatives Programme", "Trading"],
  ];
  const fees = [4500, 6500, 12000, 9000, 9000, 5500, 7500, 15000, 18000];
  const courses = courseRows.map(([code, name, category], i) => ({ id: uid(), code, name, category, fee: fees[i], duration: "4 weeks", mode: "Online + Offline", active: true, created_at: iso(new Date()) }));
  const batches = courses.slice(0, 5).map((c, i) => ({ id: uid(), course_id: c.id, name: `${c.code} ${["Oct", "Nov"][i % 2]} Weekend`, start_date: day(10 + i * 7), schedule: "Sat-Sun 10am-1pm", mode: i % 2 ? "Offline" : "Online", seats: 30, status: "Upcoming", created_at: iso(new Date()) }));
  const first = ["Rahul", "Priya", "Amit", "Sneha", "Vikas", "Neha", "Rohit", "Pooja", "Arjun", "Kavya", "Sanjay", "Anjali", "Manish", "Divya", "Karan", "Ritu", "Suresh", "Meera", "Aditya", "Nisha", "Gaurav", "Swati", "Deepak", "Isha", "Harsh", "Tanvi"];
  const last = ["Sharma", "Verma", "Patel", "Iyer", "Gupta", "Nair", "Joshi", "Reddy", "Mehta", "Singh", "Kulkarni", "Das"];
  const cities = ["Mumbai", "Pune", "Delhi", "Bengaluru", "Ahmedabad", "Indore", "Jaipur", "Lucknow", "Nagpur"];
  const stages = CONFIG.STAGES;
  const leads = [], activities = [], payments = [];
  for (let i = 0; i < 42; i++) {
    const stage = pick([...stages, "New", "Contacted", "Interested", "Enrolled", "Demo Scheduled"]);
    const course = pick(courses), created = new Date(); created.setDate(created.getDate() - Math.floor(rnd() * 45));
    const owner = pick([me, c1, c2, c1, c2, null]);
    const lead = {
      id: uid(), full_name: `${pick(first)} ${pick(last)}`, phone: "9190000" + String(10000 + i).slice(-5),
      email: "", city: pick(cities), course_id: course.id, batch_id: stage === "Enrolled" ? (batches.find(b => b.course_id === course.id) || {}).id || null : null,
      source: pick(CONFIG.SOURCES), stage, priority: pick(["Hot", "Warm", "Warm", "Cold"]), owner_id: owner,
      follow_up_on: ["Enrolled", "Lost"].includes(stage) ? null : day(Math.floor(rnd() * 10) - 4),
      fee_quoted: ["Fee Discussion", "Enrolled"].includes(stage) ? course.fee : null,
      lost_reason: stage === "Lost" ? pick(CONFIG.LOST_REASONS) : null, notes: "Sample lead for demo mode",
      enrolled_on: stage === "Enrolled" ? day(-Math.floor(rnd() * 20)) : null,
      created_by: owner, created_at: iso(created), updated_at: iso(created),
    };
    leads.push(lead);
    activities.push({ id: uid(), lead_id: lead.id, type: "system", body: `Lead created from ${lead.source}`, created_by: owner, created_at: iso(created) });
    if (stage !== "New") activities.push({ id: uid(), lead_id: lead.id, type: pick(["call", "whatsapp", "note"]), body: pick(["Asked about weekend batch timings", "Wants EMI option", "Will discuss with parents", "Interested in derivatives, sent brochure", "Busy, call back evening"]), created_by: owner, created_at: iso(new Date(created.getTime() + 86400000)) });
    if (stage === "Enrolled") {
      const paid = rnd() > 0.4 ? lead.fee_quoted : Math.round(lead.fee_quoted / 2);
      payments.push({ id: uid(), lead_id: lead.id, amount: paid, mode: pick(CONFIG.PAYMENT_MODES), reference: "", paid_on: lead.enrolled_on, created_by: owner, created_at: iso(new Date()) });
    }
  }
  const templates = [
    ["Welcome", "Namaste {name}, thank you for your enquiry with {institute}. You asked about {course}. Shall I share the course details, fees and next batch timings?"],
    ["Course details", "Hi {name}, here are the details for {course}: duration, batch timings, exam preparation and mock tests. When is a good time for a quick call? - {counsellor}, {institute}"],
    ["Demo class reminder", "Hi {name}, a reminder that your free demo class is on {date}. Please join 5 minutes early. Reply here if you have any questions. - {counsellor}, {institute}"],
    ["No reply follow-up", "Hi {name}, do you have any questions about {course}? Seats in the next batch are limited. Reply with a convenient time and we will call you."],
    ["Fee reminder", "Hi {name}, the last date to pay the fee for {course} ({batch}) is {date}. Balance due: {balance}. Message me for UPI or EMI options. - {counsellor}"],
    ["Admission confirmed", "Congratulations {name}! Your admission to {course} ({batch}) is confirmed. The schedule and study material will be shared shortly. Welcome to {institute}."],
  ].map(([name, body]) => ({ id: uid(), name, channel: "whatsapp", body, created_at: iso(new Date()) }));
  return { me, profiles, courses, batches, leads, activities, payments, templates };
}
