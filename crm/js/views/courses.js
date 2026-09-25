import { state, onChange, isAdmin, saveRow, removeRow, courseShort, course } from "../state.js";
import { esc, options, money, fmtDate, openModal, closeModal, confirmBox, toast, fail, formData } from "../ui.js";

const CATEGORIES = ["NISM Certification", "Global Certification", "Foundation", "Investment", "Trading", "Wealth Management", "Research & Advisory", "Other"];
const BATCH_STATUS = ["Upcoming", "Running", "Completed", "Cancelled"];

export function render(root) {
  const admin = isAdmin();
  const draw = () => {
    const enrolled = id => state.leads.filter(l => l.batch_id === id && l.stage === "Enrolled").length;
    const interest = id => state.leads.filter(l => l.course_id === id).length;
    root.innerHTML = `
      ${admin ? "" : `<p class="hint">Only admins can edit courses and batches.</p>`}
      <section class="panel"><div class="panel-head"><h2>Courses</h2>${admin ? `<button class="btn primary sm" data-new="course">Add course</button>` : ""}</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Course</th><th>Category</th><th>Duration</th><th class="r">Fee</th><th class="r">Leads</th><th>Status</th></tr></thead><tbody>
        ${state.courses.map(c => `<tr data-course="${c.id}"><td class="mono">${esc(c.code || "")}</td><td class="cell-main">${esc(c.name)}</td><td>${esc(c.category)}</td><td>${esc(c.duration || "")}</td>
          <td class="r num">${c.fee ? money(c.fee) : '<span class="muted">Set fee</span>'}</td><td class="r num">${interest(c.id)}</td><td>${c.active ? '<span class="pill stage-enrolled">Active</span>' : '<span class="pill">Hidden</span>'}</td></tr>`).join("")}
        </tbody></table></div></section>
      <section class="panel"><div class="panel-head"><h2>Batches</h2>${admin ? `<button class="btn primary sm" data-new="batch">Add batch</button>` : ""}</div>
        ${state.batches.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Batch</th><th>Course</th><th>Starts</th><th>Schedule</th><th>Mode</th><th class="r">Enrolled / seats</th><th>Status</th></tr></thead><tbody>
        ${state.batches.map(b => { const n = enrolled(b.id); return `<tr data-batch="${b.id}"><td class="cell-main">${esc(b.name)}</td><td>${esc(courseShort(b.course_id))}</td><td class="nowrap">${esc(fmtDate(b.start_date))}</td><td>${esc(b.schedule || "")}</td><td>${esc(b.mode || "")}</td>
          <td class="r num" style="${b.seats && n >= b.seats ? "color:var(--bad)" : ""}">${n}${b.seats ? " / " + b.seats : ""}</td><td><span class="pill ${b.status === "Running" ? "stage-enrolled" : b.status === "Upcoming" ? "stage-new" : ""}">${esc(b.status)}</span></td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">No batches yet.${admin ? " Add one so students can be enrolled into it." : ""}</div>`}</section>`;
  };
  root.addEventListener("click", e => {
    if (!admin) return;
    const n = e.target.closest("[data-new]"); if (n) return n.dataset.new === "course" ? courseDialog({ active: true, category: "NISM Certification" }) : batchDialog({ status: "Upcoming", mode: "Online" });
    const c = e.target.closest("[data-course]"); if (c) return courseDialog(course(c.dataset.course));
    const b = e.target.closest("[data-batch]"); if (b) return batchDialog(state.batches.find(x => x.id === b.dataset.batch));
  });
  draw();
  return onChange(draw);
}

function courseDialog(c) {
  const body = openModal(`<h2 class="modal-title">${c.id ? "Edit course" : "Add course"}</h2>
    <form class="form-grid" id="cf">
      <label class="field"><span>Code</span><input name="code" value="${esc(c.code)}" placeholder="NISM-VIII"></label>
      <label class="field"><span>Category</span><select name="category">${options(CATEGORIES, c.category)}</select></label>
      <label class="field full"><span>Course name</span><input name="name" required value="${esc(c.name)}"></label>
      <label class="field"><span>Fee (₹)</span><input name="fee" type="number" min="0" value="${esc(c.fee)}"></label>
      <label class="field"><span>Duration</span><input name="duration" value="${esc(c.duration)}" placeholder="4 weeks"></label>
      <label class="field"><span>Mode</span><input name="mode" value="${esc(c.mode)}" placeholder="Online + Offline"></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="active" ${c.active ? "checked" : ""}> Active (shown on enquiry form)</label>
      <div class="row full">${c.id ? `<button type="button" class="btn ghost" data-del style="color:var(--bad)">Delete</button>` : ""}<span class="spacer"></span><button type="button" class="btn" data-no>Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
  wire(body, "courses", c, d => ({ ...d, fee: d.fee ? Number(d.fee) : null }), "Leads interested in this course will keep their record but lose the course link.");
}

function batchDialog(b) {
  const body = openModal(`<h2 class="modal-title">${b.id ? "Edit batch" : "Add batch"}</h2>
    <form class="form-grid" id="cf">
      <label class="field full"><span>Course</span><select name="course_id" required>${options(state.courses, b.course_id, { blank: "Choose course", value: c => c.id, label: c => c.name })}</select></label>
      <label class="field full"><span>Batch name</span><input name="name" required value="${esc(b.name)}" placeholder="NISM-VIII Nov Weekend"></label>
      <label class="field"><span>Start date</span><input name="start_date" type="date" value="${esc(b.start_date)}"></label>
      <label class="field"><span>Seats</span><input name="seats" type="number" min="0" value="${esc(b.seats)}"></label>
      <label class="field"><span>Schedule</span><input name="schedule" value="${esc(b.schedule)}" placeholder="Sat–Sun 10am–1pm"></label>
      <label class="field"><span>Mode</span><select name="mode">${options(["Online", "Offline", "Hybrid"], b.mode)}</select></label>
      <label class="field"><span>Status</span><select name="status">${options(BATCH_STATUS, b.status)}</select></label>
      <div class="row full">${b.id ? `<button type="button" class="btn ghost" data-del style="color:var(--bad)">Delete</button>` : ""}<span class="spacer"></span><button type="button" class="btn" data-no>Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
  wire(body, "batches", b, d => ({ ...d, seats: d.seats ? Number(d.seats) : null }), "Students in this batch will stay enrolled but lose the batch link.");
}

function wire(body, table, row, map, delText) {
  body.querySelector("[data-no]").onclick = closeModal;
  body.querySelector("#cf").onsubmit = async e => {
    e.preventDefault();
    try { await saveRow(table, { ...(row.id ? { id: row.id } : {}), ...map(formData(e.target)) }); closeModal(); toast("Saved"); } catch (ex) { fail(ex); }
  };
  const del = body.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (!(await confirmBox("Delete this?", delText))) return;
    try { await removeRow(table, row.id); toast("Deleted"); } catch (ex) { fail(ex); }
  };
}
