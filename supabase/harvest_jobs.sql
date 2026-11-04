-- Harvest jobs schema. Same shape/RLS pattern as spray_jobs / seeding_jobs
-- (soft-delete on the parent, business_id scoping on every row), confirmed
-- against the live spray_jobs / seeding_jobs policies:
--   harvest_jobs_select / _insert / _update: is_business_member(business_id)
--   harvest_jobs_delete: business_role(business_id) = ANY (ARRAY['owner','manager'])
--
-- Unlike spray_jobs/seeding_jobs there is no child products table — a
-- harvest job doesn't apply a chemical/seed product, it records a result.
-- Yield/moisture/protein/screenings/grade/destination are only known once
-- the paddock is actually off, so they're populated at Finish, not at
-- job start (the "starting weather" fields are the only thing set when
-- the job is started, mirroring spray_jobs/seeding_jobs).

create table if not exists public.harvest_jobs (
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
  header_width_m numeric,
  ground_speed_kmh numeric,
  yield_value numeric,
  yield_unit text check (yield_unit in ('t_ha', 'bu_ac')),
  moisture_pct numeric,
  protein_pct numeric,
  screenings_pct numeric,
  grade text,
  destination text,
  temperature_c numeric,
  humidity numeric,
  wind_speed numeric,
  wind_direction text,
  weather_captured_at timestamptz,
  temperature_c_auto numeric,
  humidity_auto numeric,
  wind_speed_auto numeric,
  wind_direction_auto text,
  weather_edited boolean,
  gps_lat numeric,
  gps_lon numeric,
  finish_temperature_c numeric,
  finish_humidity numeric,
  finish_wind_speed numeric,
  finish_wind_direction text,
  finish_weather_captured_at timestamptz,
  notes text,
  finish_notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists harvest_jobs_business_id_idx on public.harvest_jobs(business_id);
create index if not exists harvest_jobs_status_idx on public.harvest_jobs(status);
create index if not exists harvest_jobs_deleted_at_idx on public.harvest_jobs(deleted_at);

alter table public.harvest_jobs enable row level security;

drop policy if exists "harvest_jobs_select" on public.harvest_jobs;
drop policy if exists "harvest_jobs_insert" on public.harvest_jobs;
drop policy if exists "harvest_jobs_update" on public.harvest_jobs;
drop policy if exists "harvest_jobs_delete" on public.harvest_jobs;

create policy "harvest_jobs_select" on public.harvest_jobs for select using (
  is_business_member(business_id)
);
create policy "harvest_jobs_insert" on public.harvest_jobs for insert with check (
  is_business_member(business_id)
);
create policy "harvest_jobs_update" on public.harvest_jobs for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "harvest_jobs_delete" on public.harvest_jobs for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

-- Realtime: match spray_jobs/seeding_jobs so useRealtime(["harvest_jobs"], ...) works.
alter publication supabase_realtime add table public.harvest_jobs;
