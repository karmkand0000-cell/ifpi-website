import { CONFIG } from "../config.js";
import { state, onChange, dueState, courseShort, courseName, personName, activeStaff, isAdmin, updateLead, deleteLead, createLead } from "../state.js";
import { esc, options, stagePill, priorityTag, showPhone, relDay, fmtDate, toCSV, parseCSV, download, normPhone, openModal, closeModal, confirmBox, toast, fail, todayISO, addDays, debounce } from "../ui.js";
import { openLead, openNewLead, changeStage } from "./lead.js";

const PAGE = 50;
const f = { q: "", stage: "", course: "", source: "", owner: "", priority: "", due: "", created: "" };
let page = 0; const selected = new Set();

export function render(root, params) {
  if (Object.keys(params).length) { Object.keys(f).forEach(k => (f[k] = "")); Object.assign(f, params); page = 0; }
  selected.clear();
  root.innerHTML = `
    <div class="toolbar">
      <label class="sr" for="fq">Search</label><input id="fq" class="input grow" type="search" placeholder="Search name, phone, email, city" value="${esc(f.q)}">
      <label class="sr" for="fstage">Stage</label><select id="fstage" class="input">${options(CONFIG.STAGES, f.stage, { blank: "All stages" })}</select>
      <label class="sr" for="fcourse">Course</label><select id="fcourse" class="input">${options(state.courses, f.course, { blank: "All courses", value: c => c.id, label: c => c.code || c.name })}</select>
      <label class="sr" for="fsource">Source</label><select id="fsource" class="input">${options(CONFIG.SOURCES, f.source, { blank: "All sources" })}</select>
      <label class="sr" for="fowner">Counsellor</label><select id="fowner" class="input">${options([{ id: "none", full_name: "Unassigned" }, ...activeStaff()], f.owner, { blank: "All counsellors", value: p => p.id, label: p => p.full_name || p.email })}</select>
      <label class="sr" for="fprio">Priority</label><select id="fprio" class="input">${options(["Hot", "Warm", "Cold"], f.priority, { blank: "Any priority" })}</select>
      <button class="btn ghost" id="fclear">Clear</button>
      <span class="spacer"></span>
      <button class="btn" id="importBtn">Import</button>
      <button class="btn" id="exportBtn">Export CSV</button>
    </div>
    <div id="bulk"></div>
    <section class="panel"><div id="tbl"></div></section>`;

  const bind = (id, key) => root.querySelector(id).addEventListener(id === "#fq" ? "input" : "change", debounce(e => { f[key] = e.target.value.trim(); page = 0; draw(); }, id === "#fq" ? 150 : 0));
  bind("#fq", "q"); bind("#fstage", "stage"); bind("#fcourse", "course"); bind("#fsource", "source"); bind("#fowner", "owner"); bind("#fprio", "priority");
  root.querySelector("#fclear").onclick = () => { Object.keys(f).forEach(k => (f[k] = "")); history.replaceState(null, "", "#/leads"); render(root, {}); };
  root.querySelector("#exportBtn").onclick = () => exportCSV(filtered());
  root.querySelector("#importBtn").onclick = () => importDialog();

  function draw() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE)); page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
    const tbl = root.querySelector("#tbl");
    tbl.innerHTML = rows.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th style="width:34px"><input type="checkbox" id="selAll" aria-label="Select all on this page" ${slice.length && slice.every(l => selected.has(l.id)) ? "checked" : ""}></th>
      <th>Lead</th><th>Course</th><th>Stage</th><th>Priority</th><th>Counsellor</th><th>Follow-up</th><th>Source</th><th>Added</th></tr></thead>
      <tbody>${slice.map(l => { const ds = dueState(l); return `<tr data-id="${l.id}" class="${selected.has(l.id) ? "sel" : ""}">
        <td><input type="checkbox" data-sel="${l.id}" aria-label="Select ${esc(l.full_name)}" ${selected.has(l.id) ? "checked" : ""}></td>
        <td><div class="cell-main">${esc(l.full_name)}</div><div class="cell-sub">${esc(showPhone(l.phone))}${l.city ? " · " + esc(l.city) : ""}</div></td>
        <td title="${esc(courseName(l.course_id))}">${esc(courseShort(l.course_id)) || '<span class="muted">—</span>'}</td>
        <td>${stagePill(l.stage)}</td><td>${priorityTag(l.priority)}</td>
        <td class="nowrap">${esc(personName(l.owner_id))}</td>
        <td class="nowrap">${ds ? `<span class="due ${ds}">${esc(relDay(l.follow_up_on))}</span>` : '<span class="muted">—</span>'}</td>
        <td>${l.source ? `<span class="tag">${esc(l.source)}</span>` : ""}</td>
        <td class="nowrap muted">${esc(fmtDate(l.created_at))}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="pager"><span>${rows.length} lead${rows.length === 1 ? "" : "s"} · page ${page + 1} of ${pages}</span>
        <button class="btn sm" id="prev" ${page === 0 ? "disabled" : ""}>Previous</button><button class="btn sm" id="next" ${page >= pages - 1 ? "disabled" : ""}>Next</button></div>`
      : `<div class="empty">${state.leads.length ? "No leads match these filters." : `No leads yet. <button class="link-btn" id="emptyAdd">Add your first lead</button> or import a list.`}</div>`;
    const p = tbl.querySelector("#prev"), n = tbl.querySelector("#next");
    if (p) p.onclick = () => { page--; draw(); }; if (n) n.onclick = () => { page++; draw(); };
    const ea = tbl.querySelector("#emptyAdd"); if (ea) ea.onclick = () => openNewLead();
    const sa = tbl.querySelector("#selAll"); if (sa) sa.onchange = () => { slice.forEach(l => sa.checked ? selected.add(l.id) : selected.delete(l.id)); draw(); };
    drawBulk();
  }

  root.querySelector("#tbl").addEventListener("click", e => {
    const cb = e.target.closest("[data-sel]");
    if (cb) { cb.checked ? selected.add(cb.dataset.sel) : selected.delete(cb.dataset.sel); cb.closest("tr").classList.toggle("sel", cb.checked); drawBulk(); return; }
    const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("input,button,a")) openLead(tr.dataset.id);
  });

  function drawBulk() {
    const box = root.querySelector("#bulk");
    if (!selected.size) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="bulkbar"><strong>${selected.size} selected</strong>
      ${isAdmin() ? `<label class="sr" for="bOwner">Assign to</label><select id="bOwner" class="input" style="width:auto">${options(activeStaff(), "", { blank: "Assign to…", value: p => p.id, label: p => p.full_name || p.email })}</select>` : ""}
      <label class="sr" for="bStage">Move to stage</label><select id="bStage" class="input" style="width:auto">${options(CONFIG.STAGES.filter(s => s !== "Enrolled"), "", { blank: "Move to stage…" })}</select>
      <label class="sr" for="bFollow">Follow-up date</label><input id="bFollow" type="date" class="input" style="width:auto" title="Set follow-up date">
      <span class="spacer"></span>
      ${isAdmin() ? `<button class="btn sm" id="bDel" style="color:var(--bad)">Delete</button>` : ""}
      <button class="btn ghost sm" id="bClear">Clear selection</button></div>`;
    const run = async (label, fn) => {
      let ok = 0; for (const id of [...selected]) { try { await fn(id); ok++; } catch (ex) { fail(ex); break; } }
      toast(`${label}: ${ok} lead${ok === 1 ? "" : "s"}`); selected.clear(); draw();
    };
    const bo = box.querySelector("#bOwner"); if (bo) bo.onchange = () => bo.value && run("Assigned", id => updateLead(id, { owner_id: bo.value }, { silent: true }));
    box.querySelector("#bStage").onchange = e => {
      const s = e.target.value; if (!s) return;
      if (s === "Lost") { const reason = CONFIG.LOST_REASONS[CONFIG.LOST_REASONS.length - 1]; run("Marked lost", id => updateLead(id, { stage: s, lost_reason: reason }, { silent: true })); }
      else run("Moved to " + s, id => updateLead(id, { stage: s }, { silent: true }));
    };
    box.querySelector("#bFollow").onchange = e => e.target.value && run("Follow-up set", id => updateLead(id, { follow_up_on: e.target.value }, { silent: true }));
    const bd = box.querySelector("#bDel"); if (bd) bd.onclick = async () => {
      if (!(await confirmBox(`Delete ${selected.size} leads?`, "Their notes and payments will be removed permanently."))) return;
      run("Deleted", id => deleteLead(id));
    };
    box.querySelector("#bClear").onclick = () => { selected.clear(); draw(); };
  }

  draw();
  return onChange(draw);
}

function filtered() {
  const q = f.q.toLowerCase(), digits = q.replace(/\D/g, ""), since = f.created ? addDays(-Number(f.created)) : "";
  return state.leads.filter(l => {
    if (f.stage && l.stage !== f.stage) return false;
    if (f.course && l.course_id !== f.course) return false;
    if (f.source && l.source !== f.source) return false;
    if (f.priority && l.priority !== f.priority) return false;
    if (f.owner === "none" ? l.owner_id : f.owner && l.owner_id !== f.owner) return false;
    if (since && l.created_at.slice(0, 10) < since) return false;
    if (f.due && dueState(l) !== f.due) return false;
    if (q) {
      const hay = `${l.full_name} ${l.email || ""} ${l.city || ""} ${l.campaign || ""}`.toLowerCase();
      if (!hay.includes(q) && !(digits.length >= 3 && l.phone.includes(digits))) return false;
    }
    return true;
  });
}

function exportCSV(rows) {
  const head = ["Name", "Phone", "Email", "City", "Course", "Stage", "Priority", "Source", "Campaign", "Counsellor", "Next follow-up", "Fee quoted", "Lost reason", "Added on"];
  const body = rows.map(l => [l.full_name, "+" + l.phone, l.email, l.city, courseName(l.course_id), l.stage, l.priority, l.source, l.campaign, personName(l.owner_id), l.follow_up_on, l.fee_quoted, l.lost_reason, (l.created_at || "").slice(0, 10)]);
  download(`ifpi-leads-${todayISO()}.csv`, toCSV([head, ...body]));
  toast(`Exported ${rows.length} leads`);
}

function importDialog() {
  const body = openModal(`<h2 class="modal-title">Import leads</h2>
    <p class="hint">Upload a CSV or paste rows from Excel / Google Sheets. The first row should be headers. Recognised columns: <span class="mono">name, phone, email, city, course, source, campaign, notes</span>. Numbers already in the CRM are skipped.</p>
    <label class="field"><span>CSV file</span><input type="file" id="impFile" accept=".csv,text/csv,.txt"></label>
    <label class="field"><span>Or paste rows</span><textarea id="impText" rows="6" class="mono" placeholder="name,phone,course,source&#10;Rahul Sharma,9876543210,NISM VIII,Instagram"></textarea></label>
    <div class="form-grid">
      <label class="field"><span>Default source</span><select id="impSource">${options(CONFIG.SOURCES, "Other")}</select></label>
      <label class="field"><span>Assign to</span><select id="impOwner">${options(activeStaff(), isAdmin() ? "" : state.me.id, { blank: "Unassigned", value: p => p.id, label: p => p.full_name || p.email })}</select></label>
    </div>
    <p class="hint" id="impStatus"></p>
    <div class="row end"><button class="btn" data-no>Cancel</button><button class="btn primary" id="impGo">Import</button></div>`);
  body.querySelector("[data-no]").onclick = closeModal;
  body.querySelector("#impFile").onchange = async e => { const file = e.target.files[0]; if (file) body.querySelector("#impText").value = await file.text(); };
  body.querySelector("#impGo").onclick = async () => {
    const rows = parseCSV(body.querySelector("#impText").value);
    if (rows.length < 1) { toast("Nothing to import", "error"); return; }
    const hasHead = rows[0].some(c => /name|phone|mobile/i.test(c));
    const head = hasHead ? rows[0].map(h => h.toLowerCase()) : ["name", "phone", "course", "source"];
    const col = k => head.findIndex(h => h.includes(k));
    const idx = { name: col("name"), phone: Math.max(col("phone"), col("mobile")), email: col("mail"), city: col("city"), course: col("course"), source: col("source"), campaign: col("campaign"), notes: col("note") };
    const data = hasHead ? rows.slice(1) : rows;
    const have = new Set(state.leads.map(l => l.phone));
    const defSource = body.querySelector("#impSource").value, owner = body.querySelector("#impOwner").value || null;
    const matchCourse = v => { if (!v) return null; const s = v.toLowerCase(); const c = state.courses.find(c => (c.code || "").toLowerCase() === s || c.name.toLowerCase() === s) || state.courses.find(c => c.name.toLowerCase().includes(s) || s.includes((c.code || "~").toLowerCase())); return c ? c.id : null; };
    let added = 0, skipped = 0; const status = body.querySelector("#impStatus"); const btn = body.querySelector("#impGo"); btn.disabled = true;
    for (const r of data) {
      const get = k => (idx[k] >= 0 ? (r[idx[k]] || "").trim() : "");
      const phone = normPhone(get("phone"));
      if (!get("name") || phone.length < 11 || have.has(phone)) { skipped++; continue; }
      have.add(phone);
      const src = CONFIG.SOURCES.find(s => s.toLowerCase() === get("source").toLowerCase()) || defSource;
      try {
        await createLead({ full_name: get("name"), phone, email: get("email") || null, city: get("city") || null, course_id: matchCourse(get("course")), source: src, campaign: get("campaign") || null, notes: get("notes") || null, owner_id: owner, stage: "New", priority: "Warm", follow_up_on: todayISO() });
        added++; status.textContent = `Imported ${added}…`;
      } catch (ex) { skipped++; }
    }
    closeModal(); toast(`Imported ${added} lead${added === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}`);
  };
}
