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
- **Machinery**: dashboard with fleet summary tiles (Machines / Due Soon / Overdue); machine detail with view + edit mode, sprayer-specific setup card, Connected Data stub (for future telematics), full maintenance schedule + "Mark Complete" workflow with permanent Service History and auto-rescheduling (editable next-due).
- **More/Tools**: calculators + external Australian resources grouped Weather / Chemicals & Labels / Spray Application / Agronomy.

# Chaser · Behind every good operation

Chaser (formerly HectareHQ) is an Australian farm operations app for broadacre farmers.
Multi-tenant, Supabase-backed, mobile-first for use in tractors, sprayers, utes and around machinery.

## Data model (Supabase-backed, deployed)
Multi-tenant Postgres schema with role-based RLS + soft deletes:
`businesses`, `business_members` (owner/manager/operator), `farms`, `paddocks`, `chemicals`, `chemical_batches`, `stock_movements`, `machinery`, `maintenance_schedules`, `maintenance_completions`, `spray_jobs`, `spray_job_products`, `operators`, `external_links`.
Every tenant row has `id` (client-generated UUID), `business_id`, `created_at`, `updated_at` (server trigger), `deleted_at` (soft-delete). Tenant isolation is enforced by `is_business_member(business_id)` + `business_role(business_id)` SECURITY DEFINER helpers.
Repository layer (`repo` in `src/lib/storage.ts`) is a Proxy that routes to `localRepo` (AsyncStorage) before sign-in and `cloudRepo` (Supabase) after. AsyncStorage remains as a backup post-migration.

## Auth & first-sign-in migration
- Email + password via Supabase Auth (email confirmation disabled).
- Signup creates a Business + owner membership on the client using UUIDs, then runs a one-time migration uploading all existing AsyncStorage data (`upsert onConflict:'id', defaultToNull:false`, retry-safe, ordered by FKs).
- Migration is scoped to fresh-business signups only; subsequent signins on other devices skip the migration to avoid duplicate uploads.
- Marker file `@hectarehq/migrated-v1:<userId>:<businessId>` records completion.

## Spray tab (Phase 3 shipped)
- Restructured into **In Progress → Planned → Recently Completed → Tools** sections with big field-friendly tap targets.
- New spray-job status `planned` (extends `draft | active | completed`). "Save as Planned" button on New Job creates a card in the Planned section that a user can pick up later.
- Multi-product tank mix + unit conversions (L/ha, mL/ha, kg/ha, g/ha, mL/100L, L/100L, %v/v) unchanged from prior iterations — still working.
- Start Job → Active Screen → Complete Job pipeline unchanged and green.

## Home dashboard
- Time-aware greeting (Good Morning / Afternoon / Evening) + farmer name (from default operator) + "What are we chasing today?" prompt on the left.
- Chaser · Behind every good operation brand on the right + refresh button.

## Not yet built (parked)
- Home "Today's Jobs" tiles (Planned / In Progress / Completed) — future pass
- History filters on /records (date, paddock, crop, chemical, operator, machine)
- APVMA product search
- Fertiliser / seeding / harvest records under paddock history

## Beta Launch-Readiness Pass (shipped)
- **Planned → Active prefill** in `/records/new` when opened with `plannedId`: the form is hydrated from the planned SprayJob row and Start Job reuses the same UUID, so planned→active→completed remains a single row (verified end-to-end in iteration_19).
- **Required-field validation** on New Job: farm, paddock, operator, machine, area, water rate. Start Job is blocked with a red banner + inline field highlights when anything is missing.
- **Offline resilience for spray jobs** (`src/lib/offline-queue.ts` + `cloud-repo.ts`): every `sprayJobs.save()` mirrors to AsyncStorage BEFORE the cloud upsert, cloud failures are swallowed and queued for retry, `sprayJobs.active/get` fall back to the shadow when the cloud lookup fails. Retry runs on app focus, every 60s, and on the active-job "Retry" banner (`testID='offline-banner'`).
- **Failure-state hardening**: `fetchWeather` races GPS lookups against 2.5s/4s timeouts and Open-Meteo against a 6s abort — the app never traps on a denied/slow GPS. `startFinishFlow` renders the finish form synchronously and captures weather + deduction preview in the background. `cancelJob` now routes through `confirm.ts` to prevent accidental deletion.
- **Legal pages**: `/legal/[slug].tsx` renders long-form Australian-appropriate Privacy Policy, Terms & Agricultural Disclaimer, and Help & Support content. All placeholders (business name, ABN, registered address, state of jurisdiction) are marked in [SQUARE BRACKETS] and a yellow "Beta draft" banner flags them for solicitor review. Linked from More → About.

## Beta launch checklist (recommended before public release)
- [ ] Replace [SQUARE BRACKET] placeholders in `/legal/[slug].tsx` with registered business name, ABN, address and state of jurisdiction; have Privacy + Terms reviewed by an Australian solicitor.
- [ ] Run a two-context Playwright RLS A/B sanity check at merge time.
- [ ] Real-device pass: GPS permission, camera/photo permission, WebView paddock map, notification permission (if enabled).


