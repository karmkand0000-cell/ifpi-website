import { CONFIG } from "../config.js";
import { state, onChange, lead, courseShort, personName, addPayment, isAdmin, deletePayment } from "../state.js";
import { esc, options, money, fmtDate, todayISO, addDays, toCSV, download, openModal, closeModal, toast, fail, showPhone, confirmBox, formData } from "../ui.js";
import { openLead } from "./lead.js";

const f = { from: "", to: "", mode: "" };

export function render(root) {
  if (!f.from) { const d = new Date(); f.from = `${todayISO().slice(0, 7)}-01`; f.to = todayISO(); }
  root.innerHTML = `
    <div class="toolbar">
      <label class="field" style="grid-auto-flow:column;align-items:center;gap:6px"><span>From</span><input id="pf" type="date" class="input" value="${f.from}"></label>
      <label class="field" style="grid-auto-flow:column;align-items:center;gap:6px"><span>To</span><input id="pt" type="date" class="input" value="${f.to}"></label>
      <label class="sr" for="pm">Mode</label><select id="pm" class="input">${options(CONFIG.PAYMENT_MODES, f.mode, { blank: "All modes" })}</select>
      <button class="btn ghost sm" data-range="month">This month</button><button class="btn ghost sm" data-range="30">Last 30 days</button><button class="btn ghost sm" data-range="all">All time</button>
      <span class="spacer"></span><button class="btn" id="px">Export CSV</button><button class="btn primary" id="padd">Record payment</button>
    </div>
    <section class="kpis" id="pk"></section>
    <section class="panel" id="ptbl"></section>`;
  const q = s => root.querySelector(s);
  q("#pf").onchange = e => { f.from = e.target.value; draw(); };
  q("#pt").onchange = e => { f.to = e.target.value; draw(); };
  q("#pm").onchange = e => { f.mode = e.target.value; draw(); };
  root.querySelectorAll("[data-range]").forEach(b => (b.onclick = () => {
    const r = b.dataset.range;
    if (r === "month") { f.from = todayISO().slice(0, 7) + "-01"; f.to = todayISO(); }
    if (r === "30") { f.from = addDays(-29); f.to = todayISO(); }
    if (r === "all") { f.from = "2000-01-01"; f.to = "2999-12-31"; }
    q("#pf").value = f.from; q("#pt").value = f.to; draw();
  }));
  q("#px").onclick = () => download(`ifpi-payments-${todayISO()}.csv`, toCSV([["Date", "Student", "Phone", "Course", "Mode", "Reference", "Amount", "Recorded by"],
    ...rows().map(p => { const l = lead(p.lead_id) || {}; return [p.paid_on, l.full_name, l.phone ? "+" + l.phone : "", courseShort(l.course_id), p.mode, p.reference, p.amount, personName(p.created_by)]; })]));
  q("#padd").onclick = addDialog;
  root.addEventListener("click", async e => {
    const del = e.target.closest("[data-del]");
    if (del) { if (await confirmBox("Remove this payment?", "It will no longer count toward fee totals.", "Remove")) { try { await deletePayment(del.dataset.del); toast("Payment removed"); } catch (ex) { fail(ex); } } return; }
    const tr = e.target.closest("tr[data-lead]"); if (tr) openLead(tr.dataset.lead, "payments");
  });

  const rows = () => state.payments.filter(p => p.paid_on >= f.from && p.paid_on <= f.to && (!f.mode || p.mode === f.mode)).sort((a, b) => (a.paid_on < b.paid_on ? 1 : -1));
  function draw() {
    const r = rows(), total = r.reduce((s, p) => s + Number(p.amount), 0);
    const modes = CONFIG.PAYMENT_MODES.map(m => [m, r.filter(p => p.mode === m).reduce((s, p) => s + Number(p.amount), 0)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    q("#pk").innerHTML = `<div class="kpi good"><span class="k-label">Collected</span><span class="k-value">${money(total)}</span><span class="k-sub">${r.length} payment${r.length === 1 ? "" : "s"}</span></div>
      ${modes.map(([m, v]) => `<div class="kpi"><span class="k-label">${esc(m)}</span><span class="k-value">${money(v)}</span></div>`).join("")}`;
    q("#ptbl").innerHTML = r.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Student</th><th>Course</th><th>Mode</th><th>Reference</th><th class="r">Amount</th>${isAdmin() ? "<th></th>" : ""}</tr></thead><tbody>
      ${r.map(p => { const l = lead(p.lead_id) || {}; return `<tr data-lead="${p.lead_id}"><td class="nowrap">${esc(fmtDate(p.paid_on))}</td><td><div class="cell-main">${esc(l.full_name || "—")}</div><div class="cell-sub">${esc(showPhone(l.phone))}</div></td>
        <td>${esc(courseShort(l.course_id))}</td><td>${esc(p.mode)}</td><td class="mono">${esc(p.reference || "")}</td><td class="r num">${money(p.amount)}</td>${isAdmin() ? `<td class="r"><button class="btn ghost sm" data-del="${p.id}">Remove</button></td>` : ""}</tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty">No payments in this period.</div>`;
  }

  function addDialog() {
    const cands = state.leads.filter(l => l.stage !== "Lost").sort((a, b) => a.full_name.localeCompare(b.full_name));
    const body = openModal(`<h2 class="modal-title">Record payment</h2>
      <form id="apf" class="form-grid">
        <label class="field full"><span>Student</span><input name="who" list="apl" required placeholder="Type a name or phone" autocomplete="off"><datalist id="apl">${cands.map(l => `<option value="${esc(l.full_name)} · ${esc(showPhone(l.phone))}"></option>`).join("")}</datalist></label>
        <label class="field"><span>Amount (₹)</span><input name="amount" type="number" min="1" required></label>
        <label class="field"><span>Paid on</span><input name="paid_on" type="date" value="${todayISO()}" required></label>
        <label class="field"><span>Mode</span><select name="mode">${options(CONFIG.PAYMENT_MODES, "UPI")}</select></label>
        <label class="field"><span>Reference / UTR</span><input name="reference"></label>
        <div class="row end full"><button type="button" class="btn" data-no>Cancel</button><button class="btn primary" type="submit">Save</button></div>
      </form>`);
    body.querySelector("[data-no]").onclick = closeModal;
    body.querySelector("#apf").onsubmit = async e => {
      e.preventDefault(); const d = formData(e.target);
      const l = cands.find(x => `${x.full_name} · ${showPhone(x.phone)}` === d.who);
      if (!l) { toast("Pick a student from the list", "error"); return; }
      try { await addPayment({ lead_id: l.id, amount: Number(d.amount), paid_on: d.paid_on, mode: d.mode, reference: d.reference }); closeModal(); toast("Payment recorded"); } catch (ex) { fail(ex); }
    };
  }
  draw();
  return onChange(draw);
}
