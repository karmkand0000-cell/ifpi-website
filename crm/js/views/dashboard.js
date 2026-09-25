import { CONFIG } from "../config.js";
import { state, onChange, dueState, courseName, courseShort, personName, isAdmin, activeStaff } from "../state.js";
import { esc, money, num, pct, todayISO, addDays, relDay, showPhone, stagePill, localISO } from "../ui.js";
import { openLead } from "./lead.js";

export function render(root) {
  const draw = () => {
    const L = state.leads, t = todayISO(), month = t.slice(0, 7), weekAgo = addDays(-7);
    const overdue = L.filter(l => dueState(l) === "overdue"), today = L.filter(l => dueState(l) === "today");
    const newWeek = L.filter(l => l.created_at.slice(0, 10) >= weekAgo);
    const enrolledMonth = L.filter(l => l.stage === "Enrolled" && (l.enrolled_on || "").startsWith(month));
    const enrolledAll = L.filter(l => l.stage === "Enrolled");
    const collectedMonth = state.payments.filter(p => (p.paid_on || "").startsWith(month)).reduce((s, p) => s + Number(p.amount), 0);
    const closed = L.filter(l => l.stage === "Enrolled" || l.stage === "Lost").length;

    // funnel
    const byStage = CONFIG.STAGES.map(s => [s, L.filter(l => l.stage === s).length]);
    const maxStage = Math.max(1, ...byStage.map(x => x[1]));
    // sources
    const src = countBy(L, l => l.source || "Other"); const maxSrc = Math.max(1, ...src.map(x => x[1]));
    // courses
    const crs = countBy(L.filter(l => l.course_id), l => l.course_id).slice(0, 8); const maxC = Math.max(1, ...crs.map(x => x[1]));
    // last 30 days
    const days = []; for (let i = 29; i >= 0; i--) days.push(addDays(-i));
    const perDay = days.map(d => L.filter(l => localISO(new Date(l.created_at)) === d).length); const maxD = Math.max(1, ...perDay);
    // team
    const team = activeStaff().map(p => {
      const mine = L.filter(l => l.owner_id === p.id);
      const enr = mine.filter(l => l.stage === "Enrolled");
      const coll = state.payments.filter(x => (x.paid_on || "").startsWith(month) && mine.some(l => l.id === x.lead_id)).reduce((s, x) => s + Number(x.amount), 0);
      return { p, total: mine.length, open: mine.filter(l => !["Enrolled", "Lost"].includes(l.stage)).length, due: mine.filter(l => ["overdue", "today"].includes(dueState(l))).length, enr: enr.length, coll };
    });
    const unassigned = L.filter(l => !l.owner_id && !["Enrolled", "Lost"].includes(l.stage)).length;

    const dueList = [...overdue, ...today].sort((a, b) => (a.follow_up_on > b.follow_up_on ? 1 : -1)).slice(0, 8);

    root.innerHTML = `
      <section class="kpis" aria-label="Key numbers">
        <a class="kpi bad" href="#/followups"><span class="k-label">Overdue follow-ups</span><span class="k-value">${num(overdue.length)}</span><span class="k-sub">${today.length} more due today</span></a>
        <a class="kpi" href="#/leads?created=7"><span class="k-label">New leads · 7 days</span><span class="k-value">${num(newWeek.length)}</span><span class="k-sub">${num(L.length)} leads in total</span></a>
        <a class="kpi good" href="#/students"><span class="k-label">Admissions this month</span><span class="k-value">${num(enrolledMonth.length)}</span><span class="k-sub">${num(enrolledAll.length)} students overall</span></a>
        <a class="kpi" href="#/payments"><span class="k-label">Collected this month</span><span class="k-value">${money(collectedMonth)}</span><span class="k-sub">Fees received</span></a>
        <div class="kpi"><span class="k-label">Conversion</span><span class="k-value">${pct(enrolledAll.length, closed)}</span><span class="k-sub">of closed leads enrolled</span></div>
      </section>

      <div class="grid-3">
        <section class="panel"><div class="panel-head"><h2>New leads, last 30 days</h2><span class="muted mono" style="font-size:13px">${num(perDay.reduce((a, b) => a + b, 0))}</span></div>
          <div class="panel-body">
            <div class="cols" role="img" aria-label="Leads added per day over the last 30 days">
              ${perDay.map((n, i) => `<div class="col ${i === 29 ? "today" : ""}" style="height:${(n / maxD) * 100}%" title="${esc(relDay(days[i]))}: ${n} lead${n === 1 ? "" : "s"}"></div>`).join("")}
            </div>
            <div class="cols-axis"><span>${esc(relDay(days[0]))}</span><span>Peak ${maxD}/day</span><span>Today</span></div>
          </div></section>
        <section class="panel"><div class="panel-head"><h2>Call today</h2><a href="#/followups" class="muted" style="font-size:13px">All follow-ups</a></div>
          <div class="list">${dueList.length ? dueList.map(l => `<div class="list-item"><div class="li-main"><button class="li-title" data-open="${l.id}">${esc(l.full_name)}</button>
            <div class="li-sub"><span class="mono">${esc(showPhone(l.phone))}</span><span>${esc(courseShort(l.course_id))}</span></div></div>
            <span class="due ${dueState(l)}">${esc(relDay(l.follow_up_on))}</span></div>`).join("") : `<div class="empty">Nothing due. Nice work.</div>`}</div></section>
      </div>

      <div class="grid-2">
        <section class="panel"><div class="panel-head"><h2>Pipeline</h2><a href="#/pipeline" class="muted" style="font-size:13px">Open board</a></div>
          <div class="panel-body bars">${byStage.map(([s, n]) => bar(s, n, maxStage, `#/leads?stage=${encodeURIComponent(s)}`, s === "Enrolled")).join("")}</div></section>
        <section class="panel"><div class="panel-head"><h2>Lead sources</h2></div>
          <div class="panel-body bars">${src.length ? src.map(([s, n]) => bar(s, n, maxSrc, `#/leads?source=${encodeURIComponent(s)}`)).join("") : `<div class="empty">No leads yet.</div>`}</div></section>
      </div>

      <div class="grid-2">
        <section class="panel"><div class="panel-head"><h2>Most asked-about courses</h2></div>
          <div class="panel-body bars">${crs.length ? crs.map(([id, n]) => bar(courseShort(id), n, maxC, `#/leads?course=${id}`, false, courseName(id))).join("") : `<div class="empty">No course interest recorded yet.</div>`}</div></section>
        <section class="panel"><div class="panel-head"><h2>Team</h2>${unassigned && isAdmin() ? `<a href="#/leads?owner=none" class="muted" style="font-size:13px">${unassigned} unassigned</a>` : ""}</div>
          <div class="table-wrap"><table class="data"><thead><tr><th>Counsellor</th><th class="r">Open</th><th class="r">Due</th><th class="r">Enrolled</th><th class="r">Conv.</th><th class="r">Collected (month)</th></tr></thead>
          <tbody>${team.map(r => `<tr style="cursor:default"><td>${esc(r.p.full_name || r.p.email)}</td><td class="r num">${r.open}</td><td class="r num" style="${r.due ? "color:var(--bad)" : ""}">${r.due}</td><td class="r num">${r.enr}</td><td class="r num">${pct(r.enr, r.total)}</td><td class="r num">${money(r.coll)}</td></tr>`).join("")}</tbody></table></div></section>
      </div>`;
  };
  root.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) openLead(b.dataset.open); });
  draw();
  return onChange(draw);
}

function bar(label, n, max, href, accent = false, title = "") {
  return `<a class="bar-row" href="${href}" style="text-decoration:none;color:inherit" title="${esc(title || label)}"><span class="b-label">${esc(label)}</span>
    <span class="bar-track"><span class="bar-fill ${accent ? "accent" : ""}" style="display:block;width:${(n / max) * 100}%"></span></span><span class="b-val">${n}</span></a>`;
}
function countBy(arr, fn) {
  const m = new Map(); for (const x of arr) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
