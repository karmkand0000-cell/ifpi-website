// Lead drawer: details, activity timeline, WhatsApp templates, payments.
import { CONFIG } from "../config.js";
import { db } from "../db.js";
import {
  state, lead, course, batch, personName, activeStaff, isAdmin, updateLead, createLead, deleteLead,
  logActivity, addPayment, deletePayment, paidFor, feeFor, balanceFor, fillTemplate, dueState, emit,
} from "../state.js";
import {
  esc, ICONS, openDrawer, closeDrawer, openModal, closeModal, confirmBox, toast, fail, options, formData,
  showPhone, normPhone, waLink, telLink, money, fmtDate, fmtDateTime, relDay, addDays, todayISO, copyText, stagePill,
} from "../ui.js";

// ---------------------------------------------------------------- stage changes with prompts
export async function changeStage(l, stage) {
  if (stage === l.stage) return true;
  if (stage === "Lost") {
    const reason = await pickLostReason();
    if (reason === null) return false;
    await updateLead(l.id, { stage, lost_reason: reason });
  } else if (stage === "Enrolled") {
    const r = await enrolDialog(l);
    if (!r) return false;
    await updateLead(l.id, { stage, ...r });
  } else {
    await updateLead(l.id, { stage });
  }
  toast(`${l.full_name.split(" ")[0]} → ${stage}`);
  return true;
}

function pickLostReason() {
  return new Promise(resolve => {
    const body = openModal(`<h2 class="modal-title">Why was this lead lost?</h2>
      <label class="field"><span>Reason</span><select id="lr">${options(CONFIG.LOST_REASONS, "")}</select></label>
      <div class="row end"><button class="btn" data-no>Cancel</button><button class="btn primary" data-yes>Mark as lost</button></div>`);
    body.querySelector("[data-no]").onclick = () => { closeModal(); resolve(null); };
    body.querySelector("[data-yes]").onclick = () => { const v = body.querySelector("#lr").value; closeModal(); resolve(v); };
  });
}

function enrolDialog(l) {
  return new Promise(resolve => {
    const bs = state.batches.filter(b => b.course_id === l.course_id && b.status !== "Completed" && b.status !== "Cancelled");
    const fee = l.fee_quoted ?? course(l.course_id)?.fee ?? "";
    const body = openModal(`<h2 class="modal-title">Enrol ${esc(l.full_name)}</h2>
      <div class="form-grid">
        <label class="field full"><span>Batch</span><select id="eb">${options(bs, l.batch_id, { blank: bs.length ? "Choose a batch" : "No open batches for this course", value: b => b.id, label: b => `${b.name}${b.start_date ? " · starts " + fmtDate(b.start_date) : ""}` })}</select></label>
        <label class="field"><span>Final fee (₹)</span><input id="ef" type="number" min="0" step="1" value="${esc(fee)}"></label>
        <label class="field"><span>Enrolment date</span><input id="ed" type="date" value="${todayISO()}"></label>
      </div>
      <p class="hint">Record the payment next, in the Payments tab.</p>
      <div class="row end"><button class="btn" data-no>Cancel</button><button class="btn primary" data-yes>Confirm admission</button></div>`);
    body.querySelector("[data-no]").onclick = () => { closeModal(); resolve(null); };
    body.querySelector("[data-yes]").onclick = () => {
      const r = { batch_id: body.querySelector("#eb").value || null, fee_quoted: body.querySelector("#ef").value ? Number(body.querySelector("#ef").value) : null, enrolled_on: body.querySelector("#ed").value || todayISO() };
      closeModal(); resolve(r);
    };
  });
}

// ---------------------------------------------------------------- new lead
export function openNewLead(prefill = {}) {
  const l = { stage: "New", priority: "Warm", owner_id: isAdmin() ? null : state.me.id, follow_up_on: todayISO(), ...prefill };
  const body = openDrawer(`<div class="d-head"><div class="d-title"><div><h2>New lead</h2><div class="sub">Add an enquiry from a call, walk-in, ad or social media</div></div>
    <button class="icon-btn" data-close-drawer aria-label="Close">${ICONS.close}</button></div></div>
    <div class="d-body">${leadForm(l, true)}</div>`);
  const f = body.querySelector("#leadForm");
  wireCourseBatch(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const d = cleanLead(formData(f)); if (!d) return;
    const note = d.first_note; delete d.first_note;
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      const row = await createLead(d);
      if (note) await logActivity(row.id, "note", note);
      toast("Lead added"); openLead(row.id);
    } catch (ex) { fail(ex); btn.disabled = false; }
  };
}

function cleanLead(d) {
  d.phone = normPhone(d.phone);
  if (d.phone.length < 11) { toast("Enter a valid 10-digit mobile number", "error"); return null; }
  if (d.fee_quoted != null) d.fee_quoted = Number(d.fee_quoted);
  if (d.stage !== "Lost") d.lost_reason = null;
  return d;
}

function leadForm(l, isNew = false) {
  const staff = activeStaff();
  const bs = state.batches.filter(b => b.course_id === l.course_id);
  return `<form id="leadForm" class="form-grid" novalidate>
    <label class="field"><span>Full name</span><input name="full_name" required value="${esc(l.full_name)}" ${isNew ? "autofocus" : ""}></label>
    <label class="field"><span>Mobile (WhatsApp)</span><input name="phone" class="mono" inputmode="tel" required value="${esc(l.phone ? showPhone(l.phone) : "")}" placeholder="98765 43210"></label>
    <label class="field"><span>Email</span><input name="email" type="email" value="${esc(l.email)}"></label>
    <label class="field"><span>City</span><input name="city" value="${esc(l.city)}"></label>
    <label class="field full"><span>Course interest</span><select name="course_id">${options(state.courses.filter(c => c.active || c.id === l.course_id), l.course_id, { blank: "Not decided yet", value: c => c.id, label: c => c.name })}</select></label>
    <label class="field"><span>Batch</span><select name="batch_id">${options(bs, l.batch_id, { blank: "—", value: b => b.id, label: b => b.name })}</select></label>
    <label class="field"><span>Source</span><select name="source">${options(CONFIG.SOURCES, l.source, { blank: "—" })}</select></label>
    <label class="field"><span>Stage</span><select name="stage">${options(CONFIG.STAGES, l.stage)}</select></label>
    <label class="field"><span>Priority</span><select name="priority">${options(["Hot", "Warm", "Cold"], l.priority || "Warm")}</select></label>
    <label class="field"><span>Counsellor</span><select name="owner_id" ${!isAdmin() && !isNew ? "disabled" : ""}>${options(staff, l.owner_id, { blank: "Unassigned", value: p => p.id, label: p => p.full_name || p.email })}</select></label>
    <label class="field"><span>Next follow-up</span><input name="follow_up_on" type="date" value="${esc(l.follow_up_on)}"></label>
    <label class="field"><span>Fee quoted (₹)</span><input name="fee_quoted" type="number" min="0" step="1" value="${esc(l.fee_quoted)}"></label>
    <label class="field"><span>Campaign / ad name</span><input name="campaign" value="${esc(l.campaign)}"></label>
    ${l.stage === "Lost" ? `<label class="field full"><span>Lost reason</span><select name="lost_reason">${options(CONFIG.LOST_REASONS, l.lost_reason, { blank: "—" })}</select></label>` : ""}
    <label class="field full"><span>${isNew ? "First note" : "Background notes"}</span><textarea name="${isNew ? "first_note" : "notes"}" placeholder="What did they ask about? Experience level, goals, preferred timing…">${isNew ? "" : esc(l.notes)}</textarea></label>
    <div class="row end full">${isNew ? "" : (isAdmin() ? `<button type="button" class="btn ghost" id="delLead" style="color:var(--bad)">Delete lead</button><span class="spacer"></span>` : "")}
      <button type="submit" class="btn primary">${isNew ? "Add lead" : "Save changes"}</button></div>
  </form>`;
}

function wireCourseBatch(f) {
  const c = f.elements.course_id, b = f.elements.batch_id;
  c.addEventListener("change", () => {
    const bs = state.batches.filter(x => x.course_id === c.value);
    b.innerHTML = options(bs, "", { blank: "—", value: x => x.id, label: x => x.name });
    if (f.elements.fee_quoted && !f.elements.fee_quoted.value && course(c.value)?.fee) f.elements.fee_quoted.placeholder = course(c.value).fee;
  });
}

// ---------------------------------------------------------------- lead drawer
export function openLead(id, tab = "activity") {
  const l = lead(id);
  if (!l) { toast("That lead isn't available to you.", "error"); return; }
  const c = course(l.course_id), b = batch(l.batch_id), ds = dueState(l);
  const body = openDrawer(`
    <div class="d-head">
      <div class="d-title">
        <div style="min-width:0"><h2>${esc(l.full_name)}</h2>
          <div class="sub"><span class="mono">${esc(showPhone(l.phone))}</span>${l.city ? " · " + esc(l.city) : ""}${c ? " · " + esc(c.code || c.name) : ""}</div></div>
        <button class="icon-btn" data-close-drawer aria-label="Close">${ICONS.close}</button>
      </div>
      <div class="row">
        <button class="btn wa sm" data-tab-go="whatsapp">${ICONS.whatsapp} WhatsApp</button>
        <a class="btn sm" href="${telLink(l.phone)}">${ICONS.phone} Call</a>
        <label class="sr" for="dStage">Stage</label>
        <select id="dStage" class="input" style="width:auto;padding:5px 8px;font-size:13.5px">${options(CONFIG.STAGES, l.stage)}</select>
        ${ds ? `<span class="due ${ds}">Follow-up ${esc(relDay(l.follow_up_on).toLowerCase() === "today" ? "today" : relDay(l.follow_up_on))}</span>` : ""}
      </div>
      <div class="d-tabs" role="tablist">
        ${[["activity", "Activity"], ["details", "Details"], ["whatsapp", "WhatsApp"], ["payments", "Fees & payments"]].map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join("")}
      </div>
    </div>
    <div class="d-body" id="dPane"></div>`, { wide: true });

  body.querySelector("#dStage").onchange = async e => {
    try { const ok = await changeStage(lead(id), e.target.value); if (!ok) e.target.value = lead(id).stage; openLead(id, currentTab); }
    catch (ex) { fail(ex); e.target.value = lead(id).stage; }
  };
  let currentTab = tab;
  const show = t => {
    currentTab = t;
    body.querySelectorAll("[data-tab]").forEach(x => x.setAttribute("aria-selected", String(x.dataset.tab === t)));
    const pane = body.querySelector("#dPane");
    ({ activity: paneActivity, details: paneDetails, whatsapp: paneWhatsApp, payments: panePayments })[t](pane, id);
  };
  body.querySelectorAll("[data-tab]").forEach(x => (x.onclick = () => show(x.dataset.tab)));
  body.querySelectorAll("[data-tab-go]").forEach(x => (x.onclick = () => show(x.dataset.tabGo)));
  show(tab);
}

const TYPE_LABEL = { note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email", stage: "Stage", payment: "Payment", followup: "Follow-up", system: "System" };
const TYPE_DOT = { note: "N", call: "C", whatsapp: "W", email: "@", stage: "S", payment: "₹", followup: "F", system: "•" };

async function paneActivity(pane, id) {
  const l = lead(id);
  pane.innerHTML = `
    <form id="logForm" class="panel panel-body" style="display:grid;gap:10px">
      <div class="row">
        <label class="sr" for="logType">Type</label>
        <select id="logType" class="input" style="width:auto">${options([["call", "Call"], ["note", "Note"], ["whatsapp", "WhatsApp"], ["email", "Email"]], "call", { value: x => x[0], label: x => x[1] })}</select>
        <span class="muted" style="font-size:13px">What happened?</span>
      </div>
      <label class="sr" for="logBody">Details</label>
      <textarea id="logBody" class="input" rows="3" placeholder="e.g. Spoke to Rahul, interested in weekend batch, will confirm after salary on 1st"></textarea>
      <div class="row">
        <span class="label">Next follow-up</span>
        <input id="logNext" type="date" class="input" style="width:auto" value="${esc(l.follow_up_on || "")}">
        <button type="button" class="btn ghost sm" data-plus="1">Tomorrow</button>
        <button type="button" class="btn ghost sm" data-plus="3">+3 days</button>
        <button type="button" class="btn ghost sm" data-plus="7">Next week</button>
        <span class="spacer"></span>
        <button class="btn primary" type="submit">Save</button>
      </div>
    </form>
    <div><h3 class="label" style="margin:0 0 10px">History</h3><ul class="timeline" id="tl"><li class="muted">Loading…</li></ul></div>`;
  pane.querySelectorAll("[data-plus]").forEach(b => (b.onclick = () => (pane.querySelector("#logNext").value = addDays(+b.dataset.plus))));
  pane.querySelector("#logForm").onsubmit = async e => {
    e.preventDefault();
    const type = pane.querySelector("#logType").value, text = pane.querySelector("#logBody").value.trim(), next = pane.querySelector("#logNext").value || null;
    if (!text && next === (l.follow_up_on || null)) { toast("Write what happened, or change the follow-up date", "error"); return; }
    try {
      if (text) await logActivity(id, type, text);
      const patch = {};
      if (next !== (lead(id).follow_up_on || null)) patch.follow_up_on = next;
      if (lead(id).stage === "New" && (type === "call" || type === "whatsapp")) patch.stage = "Contacted";
      if (Object.keys(patch).length) await updateLead(id, patch);
      toast("Saved"); openLead(id, "activity");
    } catch (ex) { fail(ex); }
  };
  try {
    const acts = await db.select("activities", { eq: { lead_id: id }, order: ["created_at", "desc"] });
    const tl = pane.querySelector("#tl"); if (!tl) return;
    tl.innerHTML = acts.length ? acts.map(a => `<li><span class="t-dot ${esc(a.type)}" title="${esc(TYPE_LABEL[a.type])}">${TYPE_DOT[a.type] || "•"}</span>
      <div><div class="t-body">${esc(a.body)}</div><div class="t-meta">${esc(TYPE_LABEL[a.type] || a.type)} · ${esc(fmtDateTime(a.created_at))}${a.created_by ? " · " + esc(personName(a.created_by)) : ""}</div></div></li>`).join("")
      : `<li class="muted">No activity yet.</li>`;
  } catch (ex) { fail(ex); }
}

function paneDetails(pane, id) {
  const l = lead(id);
  pane.innerHTML = leadForm(l) + `<p class="hint">Added ${esc(fmtDateTime(l.created_at))}${l.created_by ? " by " + esc(personName(l.created_by)) : " from the enquiry form"} · last updated ${esc(fmtDateTime(l.updated_at))}</p>`;
  const f = pane.querySelector("#leadForm");
  wireCourseBatch(f);
  f.onsubmit = async e => {
    e.preventDefault();
    const d = cleanLead(formData(f)); if (!d) return;
    if (!isAdmin()) delete d.owner_id;
    const stage = d.stage; delete d.stage;
    try {
      await updateLead(id, d);
      if (stage !== lead(id).stage) { const ok = await changeStage(lead(id), stage); if (!ok) { openLead(id, "details"); return; } }
      toast("Saved"); openLead(id, "details");
    } catch (ex) { fail(ex); }
  };
  const del = pane.querySelector("#delLead");
  if (del) del.onclick = async () => {
    if (!(await confirmBox("Delete this lead?", `${l.full_name} and all their notes and payments will be removed permanently.`))) return;
    try { await deleteLead(id); closeDrawer(); toast("Lead deleted"); } catch (ex) { fail(ex); }
  };
}

function paneWhatsApp(pane, id) {
  const l = lead(id);
  const cards = state.templates.filter(t => t.channel === "whatsapp").map(t => {
    const msg = fillTemplate(t.body, l);
    return `<div class="tpl"><h4>${esc(t.name)}</h4><p>${esc(msg)}</p>
      <div class="row"><a class="btn wa sm" target="_blank" rel="noopener" href="${esc(waLink(l.phone, msg))}" data-log="${esc(t.name)}">${ICONS.whatsapp} Open in WhatsApp</a>
      <button type="button" class="btn sm" data-copy="${esc(t.id)}">Copy</button></div></div>`;
  }).join("");
  pane.innerHTML = `<p class="hint">Each button opens WhatsApp (app or web) with the message typed in. Press send there. The CRM notes that you messaged ${esc(l.full_name.split(" ")[0])}.</p>
    ${cards || `<p class="muted">No templates yet. Add some in Message templates.</p>`}
    <div class="tpl"><h4>Custom message</h4><label class="sr" for="waCustom">Message</label>
      <textarea id="waCustom" class="input" rows="3">Hi ${esc(l.full_name.split(" ")[0])}, </textarea>
      <div class="row"><a class="btn wa sm" id="waCustomGo" target="_blank" rel="noopener" href="#" data-log="custom message">${ICONS.whatsapp} Open in WhatsApp</a></div></div>`;
  const ta = pane.querySelector("#waCustom"), go = pane.querySelector("#waCustomGo");
  const upd = () => (go.href = waLink(l.phone, ta.value)); upd(); ta.oninput = upd;
  pane.querySelectorAll("[data-copy]").forEach(b => (b.onclick = () => copyText(fillTemplate(state.templates.find(t => t.id === b.dataset.copy).body, l))));
  pane.querySelectorAll("[data-log]").forEach(a => a.addEventListener("click", async () => {
    try {
      await logActivity(id, "whatsapp", `WhatsApp sent: ${a.dataset.log}`);
      const patch = {};
      if (lead(id).stage === "New") patch.stage = "Contacted";
      if (!lead(id).follow_up_on || lead(id).follow_up_on <= todayISO()) patch.follow_up_on = addDays(2);
      if (Object.keys(patch).length) await updateLead(id, patch);
      toast("Logged. Next follow-up in 2 days");
    } catch (ex) { fail(ex); }
  }));
}

function panePayments(pane, id) {
  const l = lead(id);
  const fee = feeFor(l), paid = paidFor(id), bal = balanceFor(l);
  const rows = state.payments.filter(p => p.lead_id === id);
  pane.innerHTML = `
    <div class="facts">
      <div class="fact"><span class="label">Fee</span><strong>${fee ? money(fee) : "—"}</strong></div>
      <div class="fact"><span class="label">Paid</span><strong style="color:var(--good)">${money(paid)}</strong></div>
      <div class="fact"><span class="label">Balance</span><strong style="color:${bal ? "var(--bad)" : "var(--good)"}">${money(bal)}</strong></div>
    </div>
    ${l.stage !== "Enrolled" ? `<p class="hint">Fee is taken from "Fee quoted", or the course fee if that's blank. Mark the lead Enrolled to confirm the admission.</p>` : ""}
    <form id="payForm" class="panel panel-body form-grid">
      <label class="field"><span>Amount (₹)</span><input name="amount" type="number" min="1" step="1" required value="${bal || ""}"></label>
      <label class="field"><span>Paid on</span><input name="paid_on" type="date" required value="${todayISO()}"></label>
      <label class="field"><span>Mode</span><select name="mode">${options(CONFIG.PAYMENT_MODES, "UPI")}</select></label>
      <label class="field"><span>Reference / UTR</span><input name="reference" placeholder="Optional"></label>
      <div class="row end full"><button class="btn primary" type="submit">Record payment</button></div>
    </form>
    <div class="panel"><div class="panel-head"><h3>Payment history</h3></div>
    ${rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th class="r">Amount</th>${isAdmin() ? "<th></th>" : ""}</tr></thead><tbody>
      ${rows.map(p => `<tr style="cursor:default"><td class="nowrap">${esc(fmtDate(p.paid_on))}</td><td>${esc(p.mode)}</td><td class="mono">${esc(p.reference || "")}</td><td class="r num">${money(p.amount)}</td>${isAdmin() ? `<td class="r"><button class="btn ghost sm" data-delpay="${p.id}">Remove</button></td>` : ""}</tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">No payments recorded.</div>`}</div>`;
  pane.querySelector("#payForm").onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target); d.amount = Number(d.amount);
    if (!(d.amount > 0)) { toast("Enter an amount", "error"); return; }
    try { await addPayment({ ...d, lead_id: id }); toast("Payment recorded"); openLead(id, "payments"); } catch (ex) { fail(ex); }
  };
  pane.querySelectorAll("[data-delpay]").forEach(b => (b.onclick = async () => {
    if (!(await confirmBox("Remove this payment?", "This removes the record from fee totals.", "Remove"))) return;
    try { await deletePayment(b.dataset.delpay); openLead(id, "payments"); } catch (ex) { fail(ex); }
  }));
}
