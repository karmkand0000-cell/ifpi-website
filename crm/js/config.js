// =====================================================================
// IFPI CRM settings — the only file you need to edit.
// =====================================================================
// 1. Create a free project at https://supabase.com
// 2. Project Settings -> API: copy "Project URL" and the "anon public" key
// 3. Paste them below and commit. Until then the app runs in DEMO MODE
//    with sample data stored only in your browser.

export const CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // the long "anon public" key (safe to publish)

  INSTITUTE_NAME: "IFPI",
  INSTITUTE_TAGLINE: "Institute of Financial Planning & Investment",
  COUNTRY_CODE: "91",     // added to 10-digit mobile numbers for WhatsApp
  CURRENCY: "INR",

  STAGES: ["New", "Contacted", "Interested", "Demo Scheduled", "Demo Attended", "Fee Discussion", "Enrolled", "Lost"],
  SOURCES: ["Website", "Google Search", "Instagram", "Facebook", "YouTube", "WhatsApp", "Referral", "Google Ads", "Meta Ads", "Walk-in", "Webinar", "Seminar", "Other"],
  LOST_REASONS: ["Fees too high", "Joined elsewhere", "Not reachable", "Timing not suitable", "Only exploring", "Other"],
  PAYMENT_MODES: ["UPI", "Cash", "Card", "Bank transfer", "EMI", "Cheque"],
};
