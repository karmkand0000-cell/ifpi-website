import { state, onChange, courseName, courseShort, batch, personName, paidFor, feeFor, balanceFor, fillTemplate } from "../state.js";
import { esc, ICONS, options, money, fmtDate, showPhone, waLink, toCSV, download, todayISO } from "../ui.js";
import { openLead } from "./lead.js";

const f = { q: "", course: "", batch: "", dues: false };

export function render(root) {
  root.innerHTML = `
    <div class="toolbar">
      <label class="sr" for="sq">Search</label><input id="sq" class="input grow" type="search" placeholder="Search students" value="${esc(f.q)}">
      <label class="sr" for="sc">Course</label><select id="sc" class="input">${options(state.courses, f.course, { blank: "All courses", value: c => c.id, label: c => c.code || c.name })}</select>
      <label class="sr" for="sb">Batch</label><select id="sb" class="input">${options(state.batches, f.batch, { blank: "All batches", value: b => b.id, label: b => b.name })}</select>
      <label class="check"><input type="checkbox" id="sd" ${f.dues ? "checked" : ""}> Balance due only</label>
      <span class="spacer"></span><button class="btn" id="sx">Export CSV</button>
    </div>
    <section class="kpis" id="sk"></section>
    <section class="panel" id="st"></section>`;
  root.querySelector("#sq").oninput = e => { f.q = e.target.value.toLowerCase(); draw(); };
  root.querySelector("#sc").onchange = e => { f.course = e.target.value; draw(); };
  root.querySelector("#sb").onchange = e => { f.batch = e.target.value; draw(); };
  root.querySelector("#sd").onchange = e => { f.dues = e.target.checked; draw(); };
  root.querySelector("#sx").onclick = () => {
    const rows = list().map(l => [l.full_name, "+" + l.phone, l.email, courseName(l.course_id), batch(l.batch_id)?.name, l.enrolled_on, feeFor(l), paidFor(l.id), balanceFor(l), personName(l.owner_id)]);
    download(`ifpi-students-${todayISO()}.csv`, toCSV([["Name", "Phone", "Email", "Course", "Batch", "Enrolled on", "Fee", "Paid", "Balance", "Counsellor"], ...rows]));
  };
  root.addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr && !e.target.closest("a")) openLead(tr.dataset.id, "payments"); });

  const list = () => state.leads.filter(l => l.stage === "Enrolled"
    && (!f.course || l.course_id === f.course) && (!f.batch || l.batch_id === f.batch)
    && (!f.dues || balanceFor(l) > 0) && (!f.q || l.full_name.toLowerCase().includes(f.q) || l.phone.includes(f.q)))
    .sort((a, b) => (b.enrolled_on || "") > (a.enrolled_on || "") ? 1 : -1);

  function draw() {
    const rows = list();
    const fee = rows.reduce((s, l) => s + feeFor(l), 0), paid = rows.reduce((s, l) => s + paidFor(l.id), 0), due = rows.reduce((s, l) => s + balanceFor(l), 0);
    root.querySelector("#sk").innerHTML = `
      <div class="kpi"><span class="k-label">Students</span><span class="k-value">${rows.length}</span></div>
      <div class="kpi"><span class="k-label">Total fees</span><span class="k-value">${money(fee)}</span></div>
      <div class="kpi good"><span class="k-label">Collected</span><span class="k-value">${money(paid)}</span></div>
      <div class="kpi bad"><span class="k-label">Balance due</span><span class="k-value">${money(due)}</span><span class="k-sub">${rows.filter(l => balanceFor(l) > 0).length} students</span></div>`;
    const feeTpl = state.templates.find(t => /fee/i.test(t.name));
    root.querySelector("#st").innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Student</th><th>Course</th><th>Batch</th><th>Enrolled</th><th class="r">Fee</th><th class="r">Paid</th><th class="r">Balance</th><th></th></tr></thead><tbody>
      ${rows.map(l => { const bal = balanceFor(l); return `<tr data-id="${l.id}"><td><div class="cell-main">${esc(l.full_name)}</div><div class="cell-sub">${esc(showPhone(l.phone))}</div></td>
        <td title="${esc(courseName(l.course_id))}">${esc(courseShort(l.course_id))}</td><td>${esc(batch(l.batch_id)?.name || "—")}</td><td class="nowrap">${esc(fmtDate(l.enrolled_on))}</td>
        <td class="r num">${money(feeFor(l))}</td><td class="r num">${money(paidFor(l.id))}</td><td class="r num" style="${bal ? "color:var(--bad);font-weight:600" : "color:var(--good)"}">${bal ? money(bal) : "Paid"}</td>
        <td class="r">${bal && feeTpl ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${esc(waLink(l.phone, fillTemplate(feeTpl.body, l)))}" title="Send fee reminder">${ICONS.whatsapp}<span class="hide-sm">Remind</span></a>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="empty">No enrolled students match. Mark a lead as Enrolled to see it here.</div>`;
  }
  draw();
  return onChange(draw);
}
