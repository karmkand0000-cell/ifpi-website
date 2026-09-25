import { LIVE } from "../db.js";
import { state, onChange, saveRow } from "../state.js";
import { esc, options, fmtDate, toast, fail, initials } from "../ui.js";

export function render(root) {
  const draw = () => {
    const pending = state.profiles.filter(p => !p.active);
    root.innerHTML = `
      <section class="panel"><div class="panel-head"><h2>How to add a counsellor</h2></div>
        <div class="panel-body"><ol style="margin:0;padding-left:20px;display:grid;gap:6px">
          <li>Send them the CRM link and ask them to choose <strong>Create an account</strong>.</li>
          <li>They appear below as <strong>Waiting for approval</strong>. Click <strong>Approve</strong>.</li>
          <li>Counsellors see leads assigned to them plus unassigned leads. Admins see everything.</li>
        </ol>${LIVE ? "" : `<p class="hint" style="margin-top:10px">Demo mode: sign-ups work once Supabase is connected.</p>`}</div></section>
      <section class="panel"><div class="panel-head"><h2>Team members</h2>${pending.length ? `<span class="pill stage-fee-discussion">${pending.length} waiting for approval</span>` : ""}</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th class="r">Open leads</th><th>Joined</th></tr></thead><tbody>
        ${state.profiles.map(p => { const me = p.id === state.me.id; const open = state.leads.filter(l => l.owner_id === p.id && !["Enrolled", "Lost"].includes(l.stage)).length; return `<tr style="cursor:default">
          <td><div class="row"><span class="avatar" style="width:28px;height:28px;font-size:11px">${esc(initials(p.full_name))}</span><span class="cell-main">${esc(p.full_name || "")}</span>${me ? '<span class="tag">You</span>' : ""}</div></td>
          <td class="mono" style="font-size:13px">${esc(p.email || "")}</td>
          <td><label class="sr" for="r-${p.id}">Role</label><select id="r-${p.id}" class="input" style="width:auto;padding:5px 8px" data-role="${p.id}" ${me ? "disabled" : ""}>${options(["admin", "counsellor"], p.role, { label: x => x[0].toUpperCase() + x.slice(1) })}</select></td>
          <td>${p.active ? `<span class="pill stage-enrolled">Active</span> ${me ? "" : `<button class="btn ghost sm" data-active="${p.id}" data-v="0">Deactivate</button>`}` : `<button class="btn primary sm" data-active="${p.id}" data-v="1">Approve</button>`}</td>
          <td class="r num">${open}</td><td class="nowrap muted">${esc(fmtDate(p.created_at))}</td></tr>`; }).join("")}
        </tbody></table></div></section>`;
  };
  root.addEventListener("change", async e => {
    const s = e.target.closest("[data-role]"); if (!s) return;
    try { await saveRow("profiles", { id: s.dataset.role, role: s.value }); toast("Role updated"); } catch (ex) { fail(ex); draw(); }
  });
  root.addEventListener("click", async e => {
    const b = e.target.closest("[data-active]"); if (!b) return;
    try { await saveRow("profiles", { id: b.dataset.active, active: b.dataset.v === "1" }); toast(b.dataset.v === "1" ? "Approved" : "Deactivated"); } catch (ex) { fail(ex); }
  });
  draw();
  return onChange(draw);
}
