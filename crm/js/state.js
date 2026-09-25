// Shared app state: reference data + leads, with helpers that keep the
// activity timeline in sync when leads change.
import { db } from "./db.js";
import { CONFIG } from "./config.js";
import { todayISO, fmtDate } from "./ui.js";

const fillTemplateVars = (text, vars) => text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

export const state = {
  me: null,          // current user's profile
  profiles: [], courses: [], batches: [], templates: [],
  leads: [], payments: [],
  loaded: false,
};

const listeners = new Set();
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));
export const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

export async function loadAll() {
  const [profiles, courses, batches, templates, leads, payments] = await Promise.all([
    db.select("profiles", { order: ["full_name", "asc"] }),
    db.select("courses", { order: ["name", "asc"] }),
    db.select("batches", { order: ["start_date", "asc"] }),
    db.select("templates", { order: ["created_at", "asc"] }),
    db.select("leads", { order: ["created_at", "desc"] }),
    db.select("payments", { order: ["paid_on", "desc"] }),
  ]);
  Object.assign(state, { profiles, courses, batches, templates, leads, payments, loaded: true });
  emit();
}

export const isAdmin = () => state.me?.role === "admin";
export const course = id => state.courses.find(c => c.id === id);
export const batch = id => state.batches.find(b => b.id === id);
export const person = id => state.profiles.find(p => p.id === id);
export const courseName = id => course(id)?.name || "";
export const courseShort = id => { const c = course(id); return c ? (c.code || c.name) : ""; };
export const personName = id => person(id)?.full_name || (id ? "Unknown" : "Unassigned");
export const activeStaff = () => state.profiles.filter(p => p.active);
export const lead = id => state.leads.find(l => l.id === id);

export const isClosed = l => l.stage === "Enrolled" || l.stage === "Lost";
export function dueState(l) {
  if (!l.follow_up_on || isClosed(l)) return null;
  const t = todayISO();
  return l.follow_up_on < t ? "overdue" : l.follow_up_on === t ? "today" : "later";
}
export function paidFor(leadId) { return state.payments.filter(p => p.lead_id === leadId).reduce((s, p) => s + Number(p.amount), 0); }
export function feeFor(l) { return Number(l.fee_quoted ?? course(l.course_id)?.fee ?? 0); }
export function balanceFor(l) { return Math.max(0, feeFor(l) - paidFor(l.id)); }

// ---------- mutations
export async function logActivity(leadId, type, body) {
  return db.insert("activities", { lead_id: leadId, type, body, created_by: state.me?.id ?? null });
}

export async function createLead(data) {
  const row = await db.insert("leads", { ...data, created_by: state.me?.id ?? null });
  state.leads.unshift(row);
  await logActivity(row.id, "system", `Lead added${data.source ? " from " + data.source : ""}`);
  emit(); return row;
}

export async function updateLead(id, patch, { silent = false } = {}) {
  const before = lead(id);
  if (patch.stage && before && patch.stage !== before.stage) {
    if (patch.stage === "Enrolled" && !before.enrolled_on && !patch.enrolled_on) patch.enrolled_on = todayISO();
    if (patch.stage === "Enrolled" || patch.stage === "Lost") patch.follow_up_on = null;
  }
  const row = await db.update("leads", id, patch);
  const i = state.leads.findIndex(l => l.id === id);
  if (i >= 0) state.leads[i] = row;
  if (before) {
    const notes = [];
    if (patch.stage && patch.stage !== before.stage) notes.push(["stage", `Stage changed: ${before.stage} → ${patch.stage}${patch.stage === "Lost" && patch.lost_reason ? " (" + patch.lost_reason + ")" : ""}`]);
    if ("owner_id" in patch && patch.owner_id !== before.owner_id) notes.push(["system", `Assigned to ${personName(patch.owner_id)}`]);
    if ("follow_up_on" in patch && patch.follow_up_on && patch.follow_up_on !== before.follow_up_on) notes.push(["followup", `Follow-up set for ${patch.follow_up_on}`]);
    for (const [t, b] of notes) await logActivity(id, t, b).catch(() => {});
  }
  if (!silent) emit();
  return row;
}

export async function deleteLead(id) {
  await db.remove("leads", id);
  state.leads = state.leads.filter(l => l.id !== id);
  state.payments = state.payments.filter(p => p.lead_id !== id);
  emit();
}

export async function addPayment(p) {
  const row = await db.insert("payments", { ...p, created_by: state.me?.id ?? null });
  state.payments.unshift(row);
  await logActivity(p.lead_id, "payment", `Payment received: ₹${Number(p.amount).toLocaleString("en-IN")} via ${p.mode}${p.reference ? " (" + p.reference + ")" : ""}`);
  emit(); return row;
}
export async function deletePayment(id) {
  await db.remove("payments", id);
  state.payments = state.payments.filter(p => p.id !== id); emit();
}

export async function saveRow(table, row) {
  const list = state[table];
  if (row.id) {
    const { id, created_at, ...patch } = row;
    const saved = await db.update(table, id, patch);
    const i = list.findIndex(x => x.id === id); if (i >= 0) list[i] = saved;
  } else {
    const { id, ...rest } = row;
    list.push(await db.insert(table, rest));
  }
  emit();
}
export async function removeRow(table, id) {
  await db.remove(table, id);
  state[table] = state[table].filter(x => x.id !== id); emit();
}

export function fillTemplate(text, l) {
  const b = batch(l.batch_id);
  return fillTemplateVars(text, {
    name: (l.full_name || "").split(/\s+/)[0],
    course: courseName(l.course_id) || "the course",
    batch: b?.name || "next batch",
    date: fmtDate(l.follow_up_on || b?.start_date || ""),
    counsellor: person(l.owner_id)?.full_name || state.me?.full_name || "Team",
    institute: CONFIG.INSTITUTE_NAME,
    balance: "₹" + balanceFor(l).toLocaleString("en-IN"),
  });
}
