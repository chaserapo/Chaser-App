# HectareHQ — PRD

## What it is
A mobile-first spray application & machinery management app for Australian broadacre farmers and spray contractors. Field-ready with high-contrast UI, oversized touch targets and offline-capable calculators.

## Core features (v1.1 — Start Spray Job workflow live)
- **HectareHQ** branding across the app.
- **Home dashboard**: live weather (Open-Meteo, uses device location) shown with `Your location · lat, lon · Updated HH:MM`, refresh button. Big Start Spray Job / Resume Active Job (adaptive) + Spray Calculator CTAs. Upcoming maintenance (Good/Due Soon/Overdue badges). Recent Spray Records (completed only).
- **Start Spray Job → Active Job → Finish workflow**:
  - New Spray Job form: Farm, Paddock, Crop, Target, Operator, Machine, Area (ha), Water rate (L/ha), Speed (km/h), Boom (m), Pressure (bar), Nozzle, Nozzle spacing (m), Start time, Notes. Auto-captures Temp / RH / Delta T / Wind speed & direction + GPS on open, editable manually. Multiple products from the Chemical Register with rate + unit + live Total quantity preview.
  - Actions: **Start Job** (creates active job, re-captures fresh weather, routes to Active screen) · **Save Draft** (status=draft) · **Cancel**.
  - Active Spray Job screen: live HH:MM:SS elapsed timer, farm/paddock/area/tank mix/starting weather grid + GPS, big **Finish Spray Job** button and **Cancel Job**.
  - Finish flow: auto-captures finish weather (editable), prompts for actual hectares treated + final notes, saves with status=completed and opens the saved record.
- **Spray tab**: adaptive Start / Resume + Spray Rate, Tank Mix, Nozzle Flow, Delta T calculators.
- **Records tab**: only completed jobs; farm & chemical filter chips; detail view.
- **Chemical Register**: 5 seeded Australian products, searchable.
- **Machinery**: register, detail, maintenance list with status badges, add machine & add maintenance flows.
- **More/Tools**: calculators + external Australian resources grouped Weather / Chemicals & Labels / Spray Application / Agronomy.

## Data model (Supabase-ready)
`businesses`, `business_members`, `farms`, `paddocks`, `chemicals`, `machinery`, `maintenance`, `spray_jobs` (now with `status: draft|active|completed` and finish weather block), `spray_job_products`.
Persisted via AsyncStorage repository with the same shape as the target Postgres schema.

## Not yet built (parked)
- Supabase auth & cloud sync (playbook available, awaiting URL + anon key)
- Farms & Paddocks CRUD screens
- GPS paddock boundaries / maps
- PDF spray application reports
- Chemical inventory auto-deduction
- Barcode/QR scanning
- Contractor/customer & invoicing
- AI querying of farm records

