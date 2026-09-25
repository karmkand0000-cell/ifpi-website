import { CONFIG } from "../config.js";
import { state, onChange, dueState, courseShort, personName, activeStaff, lead } from "../state.js";
import { esc, options, relDay, priorityTag, fail } from "../ui.js";
import { openLead, changeStage } from "./lead.js";

const f = { course: "", owner: "", showClosed: false };

export function render(root) {
  root.innerHTML = `
    <div class="toolbar">
      <label class="sr" for="pc">Course</label><select id="pc" class="input">${options(state.courses, f.course, { blank: "All courses", value: c => c.id, label: c => c.code || c.name })}</select>
      <label class="sr" for="po">Counsellor</label><select id="po" class="input">${options(activeStaff(), f.owner, { blank: "All counsellors", value: p => p.id, label: p => p.full_name || p.email })}</select>
      <label class="check"><input type="checkbox" id="pclosed" ${f.showClosed ? "checked" : ""}> Show Enrolled and Lost</label>
      <span class="spacer"></span><span class="hint">Drag a card to another column to change its stage.</span>
    </div>
    <div class="board" id="board"></div>`;
  root.querySelector("#pc").onchange = e => { f.course = e.target.value; draw(); };
  root.querySelector("#po").onchange = e => { f.owner = e.target.value; draw(); };
  root.querySelector("#pclosed").onchange = e => { f.showClosed = e.target.checked; draw(); };

  const board = root.querySelector("#board");
  function draw() {
    const stages = CONFIG.STAGES.filter(s => f.showClosed || (s !== "Enrolled" && s !== "Lost"));
    const L = state.leads.filter(l => (!f.course || l.course_id === f.course) && (!f.owner || l.owner_id === f.owner));
    board.innerHTML = stages.map(s => {
      const items = L.filter(l => l.stage === s).sort((a, b) => (a.follow_up_on || "9") > (b.follow_up_on || "9") ? 1 : -1);
      const shown = items.slice(0, 100);
      return `<section class="lane" aria-label="${esc(s)}"><div class="lane-head"><span>${esc(s)}</span><span class="num">${items.length}</span></div>
        <div class="lane-body" data-stage="${esc(s)}">${shown.map(card).join("")}${items.length > shown.length ? `<p class="hint" style="text-align:center">+${items.length - shown.length} more in Leads</p>` : ""}</div></section>`;
    }).join("");
  }
  const card = l => {
    const ds = dueState(l);
    return `<article class="kcard" draggable="true" data-id="${l.id}" tabindex="0">
      <div class="row between"><span class="k-name">${esc(l.full_name)}</span>${priorityTag(l.priority)}</div>
      <div class="k-meta">${l.course_id ? `<span class="tag">${esc(courseShort(l.course_id))}</span>` : ""}<span>${esc(personName(l.owner_id))}</span></div>
      ${ds ? `<div class="k-meta"><span class="due ${ds}">Follow-up ${esc(relDay(l.follow_up_on))}</span></div>` : ""}
    </article>`;
  };

  let dragId = null;
  board.addEventListener("dragstart", e => { const c = e.target.closest(".kcard"); if (!c) return; dragId = c.dataset.id; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
  board.addEventListener("dragend", e => { e.target.closest(".kcard")?.classList.remove("dragging"); board.querySelectorAll(".drop").forEach(x => x.classList.remove("drop")); });
  board.addEventListener("dragover", e => { const lane = e.target.closest(".lane-body"); if (!lane) return; e.preventDefault(); board.querySelectorAll(".drop").forEach(x => x !== lane && x.classList.remove("drop")); lane.classList.add("drop"); });
  board.addEventListener("drop", async e => {
    const lane = e.target.closest(".lane-body"); if (!lane) return; e.preventDefault(); lane.classList.remove("drop");
    const l = lead(dragId || e.dataTransfer.getData("text/plain")); dragId = null;
    if (!l || l.stage === lane.dataset.stage) return;
    try { await changeStage(l, lane.dataset.stage); } catch (ex) { fail(ex); }
    draw();
  });
  board.addEventListener("click", e => { const c = e.target.closest(".kcard"); if (c) openLead(c.dataset.id); });
  board.addEventListener("keydown", e => { const c = e.target.closest(".kcard"); if (c && e.key === "Enter") openLead(c.dataset.id); });

  draw();
  return onChange(draw);
}
