-- Seeding jobs schema. Mirrors spray_jobs / spray_job_products exactly in
-- shape (soft-delete on the parent, hard-delete on removed child rows,
-- business_id scoping on every row) and RLS policy, confirmed directly
-- against the live spray_jobs policies:
--   spray_jobs_select / _insert / _update: is_business_member(business_id)
--   spray_jobs_delete: business_role(business_id) = ANY (ARRAY['owner','manager'])
--     — only owners/managers can delete a job; any member can select/insert/update.
--
-- seeding_job_products confirmed against the live spray_job_products
-- policies too: is_business_member(business_id) for select/insert/update,
-- and the SAME owner/manager-only restriction as the parent table for
-- delete — any member can create/edit a job's products, but only an
-- owner/manager can remove a product row (including the delete-orphaned-
-- products cleanup in saveSprayJob/saveSeedingJob when a product is
-- removed from the list and the job is saved).

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

drop policy if exists "seeding_jobs_select" on public.seeding_jobs;
drop policy if exists "seeding_jobs_insert" on public.seeding_jobs;
drop policy if exists "seeding_jobs_update" on public.seeding_jobs;
drop policy if exists "seeding_jobs_delete" on public.seeding_jobs;

create policy "seeding_jobs_select" on public.seeding_jobs for select using (
  is_business_member(business_id)
);
create policy "seeding_jobs_insert" on public.seeding_jobs for insert with check (
  is_business_member(business_id)
);
create policy "seeding_jobs_update" on public.seeding_jobs for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "seeding_jobs_delete" on public.seeding_jobs for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

drop policy if exists "seeding_job_products_select" on public.seeding_job_products;
drop policy if exists "seeding_job_products_insert" on public.seeding_job_products;
drop policy if exists "seeding_job_products_update" on public.seeding_job_products;
drop policy if exists "seeding_job_products_delete" on public.seeding_job_products;

create policy "seeding_job_products_select" on public.seeding_job_products for select using (
  is_business_member(business_id)
);
create policy "seeding_job_products_insert" on public.seeding_job_products for insert with check (
  is_business_member(business_id)
);
create policy "seeding_job_products_update" on public.seeding_job_products for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "seeding_job_products_delete" on public.seeding_job_products for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

-- Realtime: match spray_jobs/spray_job_products so useRealtime(["seeding_jobs", "seeding_job_products"], ...) works.
alter publication supabase_realtime add table public.seeding_jobs;
alter publication supabase_realtime add table public.seeding_job_products;
