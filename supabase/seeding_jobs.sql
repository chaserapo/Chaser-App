-- Seeding jobs schema. Mirrors spray_jobs / spray_job_products exactly in
-- shape (soft-delete on the parent, hard-delete on removed child rows,
-- business_id scoping on every row).
--
-- IMPORTANT: this file was written without being able to read your live
-- spray_jobs RLS policies directly (no DB access from this environment) --
-- it assumes the common "member of business_members" ownership pattern.
-- Before running this, open the Supabase SQL editor, run:
--   select policyname, qual, with_check from pg_policies where tablename = 'spray_jobs';
-- and compare against the policies below. If your spray_jobs policies look
-- different, adjust the ones below to match rather than running as-is.

create table if not exists public.seeding_jobs (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'completed')),
  farm_id uuid references public.farms(id) on delete set null,
  farm_name text,
  paddock_id uuid references public.paddocks(id) on delete set null,
  paddock_name text,
  crop text,
  variety text,
  date text not null,
  start_time text,
  finish_time text,
  operator_id uuid references public.operators(id) on delete set null,
  operator text,
  machinery_id uuid references public.machinery(id) on delete set null,
  machinery_name text,
  area_ha numeric,
  actual_area_ha numeric,
  target_plants_m2 numeric,
  tsw_g numeric,
  germination_pct numeric,
  establishment_pct numeric,
  seed_rate_kg_ha numeric,
  row_spacing_cm numeric,
  sowing_depth_mm numeric,
  temperature_c numeric,
  soil_temp_c numeric,
  humidity numeric,
  wind_speed numeric,
  wind_direction text,
  weather_captured_at timestamptz,
  temperature_c_auto numeric,
  soil_temp_c_auto numeric,
  humidity_auto numeric,
  wind_speed_auto numeric,
  wind_direction_auto text,
  weather_edited boolean,
  gps_lat numeric,
  gps_lon numeric,
  finish_temperature_c numeric,
  finish_soil_temp_c numeric,
  finish_humidity numeric,
  finish_wind_speed numeric,
  finish_wind_direction text,
  finish_weather_captured_at timestamptz,
  notes text,
  finish_notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.seeding_job_products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  seeding_job_id uuid not null references public.seeding_jobs(id) on delete cascade,
  chemical_id uuid,
  chemical_name text,
  chemical_group text,
  cost_per_unit numeric,
  cost_unit text,
  rate numeric,
  unit text,
  custom_unit_label text,
  total_qty numeric,
  total_qty_unit text
);

create index if not exists seeding_jobs_business_id_idx on public.seeding_jobs(business_id);
create index if not exists seeding_jobs_status_idx on public.seeding_jobs(status);
create index if not exists seeding_jobs_deleted_at_idx on public.seeding_jobs(deleted_at);
create index if not exists seeding_job_products_seeding_job_id_idx on public.seeding_job_products(seeding_job_id);

alter table public.seeding_jobs enable row level security;
alter table public.seeding_job_products enable row level security;

drop policy if exists "seeding_jobs_select_member" on public.seeding_jobs;
drop policy if exists "seeding_jobs_insert_member" on public.seeding_jobs;
drop policy if exists "seeding_jobs_update_member" on public.seeding_jobs;
drop policy if exists "seeding_jobs_delete_member" on public.seeding_jobs;

create policy "seeding_jobs_select_member" on public.seeding_jobs for select using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_jobs.business_id and bm.user_id = auth.uid())
);
create policy "seeding_jobs_insert_member" on public.seeding_jobs for insert with check (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_jobs.business_id and bm.user_id = auth.uid())
);
create policy "seeding_jobs_update_member" on public.seeding_jobs for update using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_jobs.business_id and bm.user_id = auth.uid())
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_jobs.business_id and bm.user_id = auth.uid())
);
create policy "seeding_jobs_delete_member" on public.seeding_jobs for delete using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_jobs.business_id and bm.user_id = auth.uid())
);

drop policy if exists "seeding_job_products_select_member" on public.seeding_job_products;
drop policy if exists "seeding_job_products_insert_member" on public.seeding_job_products;
drop policy if exists "seeding_job_products_update_member" on public.seeding_job_products;
drop policy if exists "seeding_job_products_delete_member" on public.seeding_job_products;

create policy "seeding_job_products_select_member" on public.seeding_job_products for select using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_job_products.business_id and bm.user_id = auth.uid())
);
create policy "seeding_job_products_insert_member" on public.seeding_job_products for insert with check (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_job_products.business_id and bm.user_id = auth.uid())
);
create policy "seeding_job_products_update_member" on public.seeding_job_products for update using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_job_products.business_id and bm.user_id = auth.uid())
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_job_products.business_id and bm.user_id = auth.uid())
);
create policy "seeding_job_products_delete_member" on public.seeding_job_products for delete using (
  exists (select 1 from public.business_members bm where bm.business_id = seeding_job_products.business_id and bm.user_id = auth.uid())
);

-- Realtime: match spray_jobs/spray_job_products so useRealtime(["seeding_jobs", "seeding_job_products"], ...) works.
alter publication supabase_realtime add table public.seeding_jobs;
alter publication supabase_realtime add table public.seeding_job_products;
