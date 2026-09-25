# IFPI — website + CRM

One site, two parts, one database:

| Address | What it is |
|---|---|
| `/` (`index.html`) | Public website for the Institute of Financial Planning & Investment |
| `/crm/` | Staff CRM — leads, follow-ups, pipeline, students, payments |
| `/crm/enquiry.html` | Short enquiry form for ads and Instagram bio links |

Every enquiry from the website form is saved straight into the CRM as a **New** lead,
tagged with the programme, "I am a…", preferred mode, city and where they heard about IFPI.
Links with `?utm_source=Instagram&utm_campaign=nism-oct` are tagged with that source and campaign.

## Connect the database (one place only)

1. Create a Supabase project (region Mumbai), run `crm/supabase/schema.sql` in the SQL Editor.
2. In Supabase → Authentication → URL Configuration, set **Site URL** to the CRM address,
   e.g. `https://karmkand0000-cell.github.io/ifpi-website/crm/`.
3. Paste the Project URL and anon public key into **`crm/js/config.js`**.
   The website and the CRM both read this file.

Until the keys are set, the CRM runs in demo mode and the website form also opens WhatsApp
(+91 99106 13552) with the enquiry typed in, so no real lead is lost.

## Change things

- Website text, programmes, NISM list, FAQ: `index.html`
- WhatsApp number used by the website: `SITE.WHATSAPP` near the bottom of `index.html`
- Lead sources, pipeline stages, institute name: `crm/js/config.js`
- CRM details and security rules: see comments in `crm/supabase/schema.sql`
