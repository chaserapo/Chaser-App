# AgSpray Pro — PRD

## What it is
A mobile-first spray application & machinery management app for Australian broadacre farmers and spray contractors. Field-ready with high-contrast UI, oversized touch targets and offline-capable calculators.

## Core features (v1 — Demo mode)
- **Home dashboard**: live weather (Open-Meteo, uses device location), Temp / RH / Delta T / Wind / Direction, "Start Spray Job" & "Spray Calculator" CTAs, upcoming maintenance with Good/Due Soon/Overdue badges, recent spray records.
- **Spray tools** (Spray tab + More): Spray Rate Calculator, Tank Mix Calculator, Delta T Calculator (never shows "safe to spray" verdicts — only measured values + disclaimer).
- **Spray Records**: full new-record workflow (farm, paddock, crop, target, dates, operator, machinery, boom, nozzle, pressure, water rate, speed, area, auto-captured weather with manual override, multi-chemical tank mix). Records list with farm & chemical filter chips. Detail view.
- **Chemical Register**: 5 seeded Australian chemicals (Roundup PowerMAX, Estercide Xtra 680, Axial, Talstar 250 EC, Hasten). Search by name / AI / APVMA #. Detail view with label/SDS links.
- **Machinery**: register with detail, current hours, maintenance history & status badges. Add new machine + add new maintenance flows.
- **More/Tools**: quick access to all calculators + external Australian links organised by Weather, Chemicals & Labels, Spray Application, Agronomy (BOM, APVMA PubCRIS, APVMA Permits, GRDC, CropLife, SprayWise, DPIRD WA, Ag Vic, TeeJet, Hardi).

## Data model (Supabase-ready)
`businesses`, `business_members` (multi-user per business), `farms`, `paddocks`, `chemicals`, `machinery`, `maintenance`, `spray_jobs`, `spray_job_products`.
Currently persisted via AsyncStorage repository (`src/lib/storage.ts`) with the same shape as the target Postgres schema — ready to swap in Supabase with RLS policies from the integration playbook.

## Australian defaults
Units: hectares, L/ha, mL/ha, kg/ha, g/ha, %v/v, L/min, km/h, m, °C. Seeded business "Riverina Broadacre Co." with farms, paddocks (Wheat/Canola/Barley/Lupins), 3 machines and 5 chemicals.

## Not yet built (parked for later phases)
- Supabase auth & cloud sync (playbook obtained, awaiting user's Supabase URL + anon key)
- GPS paddock boundaries / maps
- PDF spray application reports
- Chemical inventory auto-deduction
- Barcode/QR scanning
- Contractor/customer & invoicing
- AI querying of farm records
