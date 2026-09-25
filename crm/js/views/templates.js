import { state, onChange, saveRow, removeRow, fillTemplate } from "../state.js";
import { esc, openModal, closeModal, confirmBox, toast, fail } from "../ui.js";

const SAMPLE = { full_name: "Rahul Sharma", phone: "919876543210", course_id: null, batch_id: null, follow_up_on: null, owner_id: null, fee_quoted: 9000, id: "_" };

export function render(root) {
  const draw = () => {
    const sample = { ...SAMPLE, course_id: state.courses[1]?.id || null, batch_id: state.batches[0]?.id || null };
    root.innerHTML = `
      <div class="row between"><p class="hint" style="max-width:70ch">Placeholders fill in automatically: <span class="mono">{name}</span>, <span class="mono">{course}</span>, <span class="mono">{batch}</span>, <span class="mono">{date}</span> (follow-up or batch start), <span class="mono">{counsellor}</span>, <span class="mono">{institute}</span>, <span class="mono">{balance}</span>. Keep messages about courses, batches and fees. Avoid anything that reads like a stock tip or promised returns: Meta rejects such templates and SEBI restricts unregistered investment advice.</p>
      <button class="btn primary" id="tnew">Add template</button></div>
      <div class="grid-2">${state.templates.map(t => `<div class="tpl" style="background:var(--surface)"><div class="row between"><h4>${esc(t.name)}</h4><button class="btn ghost sm" data-edit="${t.id}">Edit</button></div>
        <p>${esc(t.body)}</p><p class="hint"><strong>Preview:</strong> ${esc(fillTemplate(t.body, sample))}</p></div>`).join("") || `<div class="empty">No templates yet.</div>`}</div>`;
    root.querySelector("#tnew").onclick = () => edit({ channel: "whatsapp", name: "", body: "Hi {name}, " });
  };
  root.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) edit(state.templates.find(t => t.id === b.dataset.edit)); });
  draw();
  return onChange(draw);
}

function edit(t) {
  const body = openModal(`<h2 class="modal-title">${t.id ? "Edit template" : "New template"}</h2>
    <form id="tf" style="display:grid;gap:14px">
      <label class="field"><span>Name</span><input name="name" required value="${esc(t.name)}"></label>
      <label class="field"><span>Message</span><textarea name="body" rows="6" required>${esc(t.body)}</textarea></label>
      <div class="row">${t.id ? `<button type="button" class="btn ghost" data-del style="color:var(--bad)">Delete</button>` : ""}<span class="spacer"></span><button type="button" class="btn" data-no>Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
  body.querySelector("[data-no]").onclick = closeModal;
  body.querySelector("#tf").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    try { await saveRow("templates", { ...(t.id ? { id: t.id } : {}), channel: "whatsapp", name: f.name.value.trim(), body: f.body.value }); closeModal(); toast("Template saved"); } catch (ex) { fail(ex); }
  };
  const del = body.querySelector("[data-del]");
  if (del) del.onclick = async () => { if (await confirmBox("Delete this template?", t.name)) { try { await removeRow("templates", t.id); toast("Deleted"); } catch (ex) { fail(ex); } } };
}
