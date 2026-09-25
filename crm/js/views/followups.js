import { state, onChange, dueState, courseShort, personName, isClosed, fillTemplate, updateLead, logActivity, isAdmin } from "../state.js";
import { esc, ICONS, showPhone, relDay, todayISO, addDays, stagePill, waLink, telLink, toast, fail } from "../ui.js";
import { openLead } from "./lead.js";

let mineOnly = null;

export function render(root) {
  if (mineOnly === null) mineOnly = !isAdmin();
  const draw = () => {
    const t = todayISO(), week = addDays(7);
    const base = state.leads.filter(l => !isClosed(l) && (!mineOnly || l.owner_id === state.me.id));
    const overdue = base.filter(l => l.follow_up_on && l.follow_up_on < t).sort(by);
    const today = base.filter(l => l.follow_up_on === t).sort(by);
    const upcoming = base.filter(l => l.follow_up_on > t && l.follow_up_on <= week).sort(by);
    const none = base.filter(l => !l.follow_up_on);
    root.innerHTML = `
      <div class="toolbar"><div class="tabs-seg" role="tablist">
        <button role="tab" data-mine="1" aria-selected="${mineOnly}">My leads</button><button role="tab" data-mine="0" aria-selected="${!mineOnly}">Everyone</button></div>
        <span class="spacer"></span><span class="hint">“Done” logs the call and moves the follow-up forward.</span></div>
      ${section("Overdue", overdue, "overdue")}
      ${section("Today", today, "today")}
      ${section("Next 7 days", upcoming, "later")}
      ${none.length ? section("No follow-up date", none.slice(0, 30), "", `${none.length} open leads have no follow-up date`) : ""}`;
  };
  const section = (title, list, cls, sub) => `<section class="panel"><div class="panel-head"><h2>${esc(title)} <span class="muted mono" style="font-size:13px;font-weight:500">${list.length}</span></h2>${sub ? `<span class="hint">${esc(sub)}</span>` : ""}</div>
    <div class="list">${list.length ? list.map(l => item(l)).join("") : `<div class="empty">Nothing here.</div>`}</div></section>`;
  const item = l => {
    const tpl = state.templates.find(x => /follow/i.test(x.name)) || state.templates[0];
    const msg = tpl ? fillTemplate(tpl.body, l) : "";
    return `<div class="list-item"><div class="li-main">
        <button class="li-title" data-open="${l.id}">${esc(l.full_name)}</button>
        <div class="li-sub"><span class="mono">${esc(showPhone(l.phone))}</span><span>${esc(courseShort(l.course_id))}</span>${stagePill(l.stage)}<span>${esc(personName(l.owner_id))}</span>${l.follow_up_on ? `<span class="due ${dueState(l)}">${esc(relDay(l.follow_up_on))}</span>` : ""}</div></div>
      <div class="row">
        <a class="btn wa sm" href="${esc(waLink(l.phone, msg))}" target="_blank" rel="noopener" data-wa="${l.id}" title="Open WhatsApp with the follow-up message">${ICONS.whatsapp}<span class="hide-sm">WhatsApp</span></a>
        <a class="btn sm" href="${telLink(l.phone)}" title="Call">${ICONS.phone}<span class="hide-sm">Call</span></a>
        <button class="btn sm" data-done="${l.id}" data-days="2">Done, +2d</button>
        <button class="btn ghost sm" data-done="${l.id}" data-days="7">+1 week</button>
      </div></div>`;
  };
  const by = (a, b) => (a.follow_up_on > b.follow_up_on ? 1 : a.follow_up_on < b.follow_up_on ? -1 : (a.priority === "Hot" ? -1 : 1));

  root.addEventListener("click", async e => {
    const m = e.target.closest("[data-mine]"); if (m) { mineOnly = m.dataset.mine === "1"; draw(); return; }
    const o = e.target.closest("[data-open]"); if (o) { openLead(o.dataset.open); return; }
    const d = e.target.closest("[data-done]");
    if (d) {
      d.disabled = true;
      try {
        const l = state.leads.find(x => x.id === d.dataset.done);
        await logActivity(l.id, "call", "Follow-up done");
        await updateLead(l.id, { follow_up_on: addDays(+d.dataset.days), ...(l.stage === "New" ? { stage: "Contacted" } : {}) });
        toast(`${l.full_name.split(" ")[0]}: next follow-up ${relDay(addDays(+d.dataset.days)).toLowerCase()}`);
      } catch (ex) { fail(ex); d.disabled = false; }
      return;
    }
    const w = e.target.closest("[data-wa]");
    if (w) { try { await logActivity(w.dataset.wa, "whatsapp", "WhatsApp follow-up sent"); } catch {} }
  });
  draw();
  return onChange(draw);
}
