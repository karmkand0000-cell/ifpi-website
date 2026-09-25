// IFPI CRM — app entry: auth, shell, routing.
import { CONFIG } from "./config.js";
import { LIVE, initBackend, auth, db } from "./db.js";
import { state, loadAll, onChange, isAdmin, dueState, courseShort } from "./state.js";
import { $, $$, esc, ICONS, toast, fail, closeDrawer, closeModal, initials, showPhone, debounce } from "./ui.js";
import { openLead, openNewLead } from "./views/lead.js";
import * as dashboard from "./views/dashboard.js";
import * as leads from "./views/leads.js";
import * as pipeline from "./views/pipeline.js";
import * as followups from "./views/followups.js";
import * as students from "./views/students.js";
import * as payments from "./views/payments.js";
import * as courses from "./views/courses.js";
import * as templates from "./views/templates.js";
import * as team from "./views/team.js";

const ROUTES = {
  dashboard: { title: "Dashboard", icon: "dashboard", view: dashboard, group: "Overview" },
  followups: { title: "Follow-ups", icon: "followups", view: followups, group: "Overview" },
  leads: { title: "Leads", icon: "leads", view: leads, group: "Sales" },
  pipeline: { title: "Pipeline", icon: "pipeline", view: pipeline, group: "Sales" },
  students: { title: "Students", icon: "students", view: students, group: "Admissions" },
  payments: { title: "Payments", icon: "payments", view: payments, group: "Admissions" },
  courses: { title: "Courses & batches", icon: "courses", view: courses, group: "Setup" },
  templates: { title: "Message templates", icon: "templates", view: templates, group: "Setup" },
  team: { title: "Team", icon: "team", view: team, group: "Setup", admin: true },
};

let cleanup = null;

// ------------------------------------------------------------------ boot
boot().catch(err => {
  console.error(err);
  $("#boot").innerHTML = `<div class="auth-card"><h2>Couldn't start the CRM</h2><p class="muted">${esc(err.message)}</p><p class="hint">Check the Supabase URL and key in crm/js/config.js.</p></div>`;
});

async function boot() {
  document.title = `${CONFIG.INSTITUTE_NAME} CRM`;
  $$("#authInstitute, #sideInstitute").forEach(e => (e.textContent = CONFIG.INSTITUTE_NAME));
  $("#authTagline").textContent = CONFIG.INSTITUTE_TAGLINE;
  $("#menuBtn").innerHTML = ICONS.menu; $("#searchIcon").innerHTML = ICONS.search; $("#plusIcon").innerHTML = ICONS.plus;

  await initBackend();
  wireGlobal();

  auth.onChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") { showAuth("newpass"); }
    if (event === "SIGNED_OUT") { location.hash = ""; showAuth("signin"); }
  });

  const session = await auth.session();
  if (!session) return showAuth(location.hash.includes("type=recovery") ? "newpass" : "signin");
  await enter(session.user);
}

async function enter(user) {
  const [profile] = await db.select("profiles", { eq: { id: user.id } });
  if (!profile) { showAuth("pending", "Your account was created but the team profile is missing. Ask your admin to run the database setup (schema.sql)."); return; }
  if (!profile.active) { showAuth("pending"); return; }
  state.me = profile;
  await loadAll();
  $("#boot").hidden = true; $("#auth").hidden = true; $("#app").hidden = false;
  if (!LIVE) {
    const b = $("#demoBanner"); b.hidden = false;
    b.innerHTML = `<strong>Demo mode.</strong> Sample data is stored only in this browser. To go live, add your Supabase keys to <span class="mono">crm/js/config.js</span> (see README).`;
  }
  renderSide();
  onChange(renderSide);
  window.addEventListener("hashchange", route);
  route();
}

// ------------------------------------------------------------------ auth screens
function showAuth(mode, message) {
  $("#boot").hidden = true; $("#app").hidden = true; $("#auth").hidden = false;
  const body = $("#authBody");
  const forms = {
    signin: `<h2>Sign in</h2>
      <form id="af" class="grid-form" style="display:grid;gap:14px">
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required autofocus></label>
        <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
        <p class="error-text" id="aerr" hidden></p>
        <button class="btn primary block" type="submit">Sign in</button>
      </form>
      <div class="row between"><button class="link-btn" data-go="forgot">Forgot password?</button><button class="link-btn" data-go="signup">Create an account</button></div>`,
    signup: `<h2>Create an account</h2>
      <p class="hint">The first account becomes the admin. Everyone else can sign in after an admin approves them.</p>
      <form id="af" style="display:grid;gap:14px">
        <label class="field"><span>Full name</span><input name="name" required autofocus></label>
        <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <p class="error-text" id="aerr" hidden></p>
        <button class="btn primary block" type="submit">Create account</button>
      </form>
      <button class="link-btn" data-go="signin">Back to sign in</button>`,
    forgot: `<h2>Reset password</h2>
      <form id="af" style="display:grid;gap:14px">
        <label class="field"><span>Email</span><input name="email" type="email" required autofocus></label>
        <p class="error-text" id="aerr" hidden></p>
        <button class="btn primary block" type="submit">Send reset link</button>
      </form>
      <button class="link-btn" data-go="signin">Back to sign in</button>`,
    newpass: `<h2>Set a new password</h2>
      <form id="af" style="display:grid;gap:14px">
        <label class="field"><span>New password</span><input name="password" type="password" minlength="8" autocomplete="new-password" required autofocus></label>
        <p class="error-text" id="aerr" hidden></p>
        <button class="btn primary block" type="submit">Save password</button>
      </form>`,
    pending: `<h2>Waiting for approval</h2>
      <p class="muted">${esc(message || "Your account is set up. An admin needs to approve it in Team before you can see leads.")}</p>
      <button class="btn block" data-signout>Sign out</button>`,
    sent: `<h2>Check your email</h2><p class="muted">${esc(message || "")}</p><button class="link-btn" data-go="signin">Back to sign in</button>`,
  };
  body.innerHTML = forms[mode];
  body.querySelectorAll("[data-go]").forEach(b => (b.onclick = () => showAuth(b.dataset.go)));
  const so = body.querySelector("[data-signout]"); if (so) so.onclick = () => auth.signOut();
  const f = body.querySelector("#af"); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)); const err = $("#aerr"); const btn = f.querySelector("button[type=submit]");
    err.hidden = true; btn.disabled = true;
    try {
      if (mode === "signin") { await auth.signIn(v.email, v.password); const s = await auth.session(); await enter(s.user); }
      if (mode === "signup") {
        const r = await auth.signUp(v.email, v.password, v.name);
        if (r?.session) await enter(r.session.user);
        else showAuth("sent", "We sent a confirmation link to " + v.email + ". Open it, then sign in.");
      }
      if (mode === "forgot") { await auth.resetPassword(v.email); showAuth("sent", "If that email has an account, a reset link is on its way."); }
      if (mode === "newpass") { await auth.updatePassword(v.password); toast("Password updated"); history.replaceState(null, "", location.pathname); const s = await auth.session(); await enter(s.user); }
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    finally { btn.disabled = false; }
  };
}

// ------------------------------------------------------------------ shell
function renderSide() {
  const overdue = state.leads.filter(l => ["overdue", "today"].includes(dueState(l))).length;
  const newCount = state.leads.filter(l => l.stage === "New").length;
  let html = "", group = "";
  for (const [key, r] of Object.entries(ROUTES)) {
    if (r.admin && !isAdmin()) continue;
    if (r.group !== group) { group = r.group; html += `<div class="nav-label">${esc(group)}</div>`; }
    const count = key === "followups" && overdue ? `<span class="count alert">${overdue}</span>` : key === "leads" && newCount ? `<span class="count">${newCount}</span>` : "";
    html += `<a href="#/${key}" data-route="${key}">${ICONS[r.icon]}<span>${esc(r.title)}</span>${count}</a>`;
  }
  $("#nav").innerHTML = html;
  markNav();
  const me = state.me;
  $("#sideFoot").innerHTML = `<div class="me"><span class="avatar">${esc(initials(me.full_name))}</span><div><strong>${esc(me.full_name || me.email)}</strong><span>${esc(me.role)}</span></div></div>
    <button class="link-btn" id="signOut">${LIVE ? "Sign out" : "Reset demo data"}</button>
    <a class="link-btn" href="../" target="_blank" rel="noopener" style="display:block;margin-top:6px;text-decoration:none">View website ↗</a>`;
  $("#signOut").onclick = async () => { await auth.signOut(); if (!LIVE) location.reload(); };
}
function markNav() {
  const cur = currentRoute().name;
  $$("#nav a").forEach(a => { if (a.dataset.route !== cur) a.removeAttribute("aria-current"); else a.setAttribute("aria-current", "page"); });
}

function currentRoute() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, "").split("/");
  const params = Object.fromEntries(new URLSearchParams(rest.join("/").split("?")[1] || name.split("?")[1] || ""));
  const clean = (name || "dashboard").split("?")[0];
  return { name: ROUTES[clean] ? clean : "dashboard", params };
}

function route() {
  const { name, params } = currentRoute();
  const r = ROUTES[name];
  if (r.admin && !isAdmin()) { location.hash = "#/dashboard"; return; }
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  $("#pageTitle").textContent = r.title;
  document.title = `${r.title} · ${CONFIG.INSTITUTE_NAME} CRM`;
  $("#app").classList.remove("nav-open"); $("#scrim").hidden = true;
  markNav();
  // fresh element per screen so listeners from the previous screen don't pile up
  const old = $("#view"); const view = old.cloneNode(false); old.replaceWith(view);
  try { cleanup = r.view.render(view, params) || null; } catch (e) { fail(e); }
  view.focus({ preventScroll: true }); window.scrollTo(0, 0);
}

function wireGlobal() {
  $("#menuBtn").onclick = () => { $("#app").classList.add("nav-open"); $("#scrim").hidden = false; };
  $("#scrim").onclick = () => { $("#app").classList.remove("nav-open"); $("#scrim").hidden = true; };
  $("#newLeadBtn").onclick = () => openNewLead();
  document.addEventListener("click", e => { if (e.target.closest("[data-close-drawer]")) closeDrawer(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { if (!$("#modalWrap").hidden) closeModal(); else if (!$("#drawerWrap").hidden) closeDrawer(); else $("#searchResults").hidden = true; }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$("#app").hidden) { e.preventDefault(); $("#globalSearch").focus(); }
  });
  $("#modalWrap").addEventListener("click", e => { if (e.target.id === "modalWrap") closeModal(); });

  const input = $("#globalSearch"), box = $("#searchResults");
  const search = debounce(() => {
    const q = input.value.trim().toLowerCase(); const digits = q.replace(/\D/g, "");
    if (!q) { box.hidden = true; return; }
    const hits = state.leads.filter(l => (l.full_name || "").toLowerCase().includes(q) || (digits.length >= 3 && (l.phone || "").includes(digits)) || (l.email || "").toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.length ? hits.map(l => `<button type="button" data-id="${l.id}"><span><strong>${esc(l.full_name)}</strong><br><span class="cell-sub">${esc(showPhone(l.phone))}</span></span><span class="muted" style="font-size:12.5px">${esc(courseShort(l.course_id))} · ${esc(l.stage)}</span></button>`).join("") : `<div class="empty-s">No leads match “${esc(q)}”.</div>`;
    box.hidden = false;
  }, 120);
  input.addEventListener("input", search);
  input.addEventListener("focus", search);
  box.addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (b) { box.hidden = true; input.value = ""; openLead(b.dataset.id); } });
  document.addEventListener("click", e => { if (!e.target.closest(".global-search")) box.hidden = true; });
  input.addEventListener("keydown", e => { if (e.key === "Enter") { const b = box.querySelector("[data-id]"); if (b) b.click(); } });
}
