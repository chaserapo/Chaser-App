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

## Not yet built (parked)
- Invite-a-member flow + members management screen
- Realtime subscriptions for multi-device live updates
- Offline outbox / write-behind sync (schema is already sync-ready)
- APVMA product search integration

