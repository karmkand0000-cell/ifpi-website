// Small UI helpers shared by every screen.
import { CONFIG } from "./config.js";

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- dates & numbers
export const todayISO = () => localISO(new Date());
export function localISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
export function addDays(n, from = new Date()) { const d = new Date(from); d.setDate(d.getDate() + n); return localISO(d); }
export function fmtDate(s) {
  if (!s) return "";
  const d = s.length === 10 ? new Date(s + "T00:00:00") : new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export function fmtDateTime(s) { return s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : ""; }
export function relDay(s) {
  if (!s) return "";
  const t = todayISO(); if (s === t) return "Today";
  if (s === addDays(1)) return "Tomorrow"; if (s === addDays(-1)) return "Yesterday";
  return fmtDate(s);
}
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: CONFIG.CURRENCY || "INR", maximumFractionDigits: 0 });
export const money = n => inr.format(Number(n) || 0);
export const num = n => new Intl.NumberFormat("en-IN").format(Number(n) || 0);
export const pct = (a, b) => b ? Math.round((a / b) * 100) + "%" : "–";

// ---------- phones & WhatsApp
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = CONFIG.COUNTRY_CODE + d;
  return d;
}
export function showPhone(d) {
  if (!d) return "";
  const cc = CONFIG.COUNTRY_CODE;
  if (d.startsWith(cc) && d.length === cc.length + 10) { const r = d.slice(cc.length); return `+${cc} ${r.slice(0, 5)} ${r.slice(5)}`; }
  return "+" + d;
}
export const waLink = (phone, text) => `https://wa.me/${phone}${text ? "?text=" + encodeURIComponent(text) : ""}`;
export const telLink = phone => `tel:+${phone}`;

// ---------- misc
export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
export const firstName = n => String(n || "").trim().split(/\s+/)[0] || "";
export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

export function stagePill(stage) { return `<span class="pill stage-${slug(stage)}">${esc(stage)}</span>`; }
export function priorityTag(p) { return `<span class="prio prio-${slug(p || "Warm")}" title="${esc(p)} lead">${esc(p || "Warm")}</span>`; }

// ---------- toast
export function toast(msg, kind = "ok") {
  const box = $("#toasts"); const t = document.createElement("div");
  t.className = "toast " + kind; t.role = "status"; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, kind === "error" ? 5000 : 2600);
}
export function fail(e) { console.error(e); toast(e?.message || String(e), "error"); }

// ---------- drawer & modal
let lastFocus = null;
export function openDrawer(html, { wide = false, onClose } = {}) {
  lastFocus = document.activeElement;
  const d = $("#drawer"); d.className = "drawer" + (wide ? " wide" : "");
  $("#drawerBody").innerHTML = html; $("#drawerWrap").hidden = false;
  document.body.classList.add("locked"); d._onClose = onClose;
  requestAnimationFrame(() => { const f = d.querySelector("[autofocus],input,select,textarea,button"); f && f.focus(); });
  return $("#drawerBody");
}
export function closeDrawer() {
  const d = $("#drawer"); $("#drawerWrap").hidden = true; $("#drawerBody").innerHTML = "";
  document.body.classList.remove("locked"); d._onClose && d._onClose(); d._onClose = null;
  lastFocus && lastFocus.focus && lastFocus.focus();
}
export function openModal(html) {
  $("#modalBody").innerHTML = html; $("#modalWrap").hidden = false;
  requestAnimationFrame(() => { const f = $("#modalBody").querySelector("[autofocus],input,select,textarea,button"); f && f.focus(); });
  return $("#modalBody");
}
export function closeModal() { $("#modalWrap").hidden = true; $("#modalBody").innerHTML = ""; }

export function confirmBox(title, text, okLabel = "Delete") {
  return new Promise(resolve => {
    const body = openModal(`<h2 class="modal-title">${esc(title)}</h2><p class="muted">${esc(text)}</p>
      <div class="row end"><button class="btn" data-no>Cancel</button><button class="btn danger" data-yes>${esc(okLabel)}</button></div>`);
    body.querySelector("[data-no]").onclick = () => { closeModal(); resolve(false); };
    body.querySelector("[data-yes]").onclick = () => { closeModal(); resolve(true); };
  });
}

// ---------- CSV
export function toCSV(rows) {
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map(r => r.map(q).join(",")).join("\r\n");
}
export function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  const delim = text.split("\n")[0].includes("\t") && !text.split("\n")[0].includes(",") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function download(filename, text, type = "text/csv") {
  const blob = new Blob(["﻿" + text], { type: type + ";charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Copied"); } catch { toast("Select and copy the text", "error"); } ta.remove(); }
}

// ---------- form helpers
export function options(list, selected, { blank = null, value = x => x, label = x => x } = {}) {
  return (blank !== null ? `<option value="">${esc(blank)}</option>` : "") +
    list.map(x => `<option value="${esc(value(x))}" ${String(value(x)) === String(selected ?? "") ? "selected" : ""}>${esc(label(x))}</option>`).join("");
}
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") o[el.name] = el.checked;
    else o[el.name] = el.value.trim() === "" ? null : el.value.trim();
  }
  return o;
}

export const ICONS = {
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>`,
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  leads: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>`,
  pipeline: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="7" rx="1"/></svg>`,
  followups: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/></svg>`,
  students: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  payments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>`,
  courses: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>`,
  templates: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  team: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`,
};
