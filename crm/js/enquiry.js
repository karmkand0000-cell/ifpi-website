// Public enquiry form. Share enquiry.html?source=Instagram&campaign=nism-oct
// in ads and bios so every lead arrives tagged with where it came from.
import { CONFIG } from "./config.js";
import { initBackend, submitEnquiry, publicCourses, LIVE } from "./db.js";
import { esc, normPhone, todayISO } from "./ui.js";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

(async () => {
  document.title = `Course Enquiry · ${CONFIG.INSTITUTE_NAME}`;
  $("#eName").textContent = CONFIG.INSTITUTE_NAME; $("#eTag").textContent = CONFIG.INSTITUTE_TAGLINE;
  try {
    await initBackend();
    const courses = await publicCourses();
    const groups = {};
    courses.forEach(c => (groups[c.category || "Courses"] ||= []).push(c));
    $("#eCourse").insertAdjacentHTML("beforeend", Object.entries(groups).map(([g, list]) =>
      `<optgroup label="${esc(g)}">${list.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</optgroup>`).join(""));
    const pre = params.get("course"); if (pre) { const m = courses.find(c => c.id === pre || (c.code || "").toLowerCase() === pre.toLowerCase()); if (m) $("#eCourse").value = m.id; }
  } catch (e) { console.error(e); }
})();

$("#ef").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, err = $("#eErr"), btn = f.querySelector("button[type=submit]");
  const v = Object.fromEntries(new FormData(f));
  const phone = normPhone(v.phone);
  const show = m => { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  if (!v.full_name?.trim()) return show("Please enter your name.");
  if (phone.length < 11) return show("Please enter a valid 10-digit mobile number.");
  if (!f.consent.checked) return show("Please tick the box so we can contact you.");
  const srcParam = (params.get("source") || params.get("utm_source") || "").toLowerCase();
  const source = CONFIG.SOURCES.find(s => s.toLowerCase() === srcParam) || (srcParam ? "Other" : "Website");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await submitEnquiry({
      full_name: v.full_name.trim(), phone, city: v.city?.trim() || null, email: v.email?.trim() || null,
      course_id: v.course_id || null, notes: v.notes?.trim() || null, source,
      campaign: params.get("campaign") || params.get("utm_campaign") || null,
      stage: "New", priority: "Warm", follow_up_on: todayISO(),
    });
    done(v.full_name);
  } catch (ex) {
    if (ex.code === "23505") return done(v.full_name, true);
    show(LIVE ? "Couldn't send right now. Please try again, or message us on WhatsApp." : ex.message);
    btn.disabled = false; btn.textContent = "Send enquiry";
  }
});

function done(name, repeat) {
  $("#card").innerHTML = `<div class="success"><div class="tick">✓</div><h1>Thank you, ${esc(name.split(" ")[0])}</h1>
    <p class="muted">${repeat ? "We already have your enquiry and a counsellor will get back to you soon." : "A counsellor will WhatsApp you shortly with course details."}</p></div>`;
}
