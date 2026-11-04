-- Spread jobs schema (fertiliser/lime/gypsum spreading). Mirrors
-- spray_jobs / spray_job_products exactly in shape and RLS policy — spread
-- jobs pick products from the same Chemical register as spray jobs, so the
-- product child table is identical. The only difference from spray_jobs is
-- which application-setup columns it carries: no nozzle/boom/water-rate
-- (that's boom-sprayer specific), speed_kmh + spread_width_m instead.

create table if not exists public.spread_jobs (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'planned', 'active', 'completed')),
  farm_id uuid references public.farms(id) on delete set null,
  farm_name text,
  paddock_id uuid references public.paddocks(id) on delete set null,
  paddock_name text,
  crop text,
  variety text,
  target text,
  date text not null,
  start_time text,
  finish_time text,
  operator_id uuid references public.operators(id) on delete set null,
  operator text,
  machinery_id uuid references public.machinery(id) on delete set null,
  machinery_name text,
  area_ha numeric,
  actual_area_ha numeric,
  speed_kmh numeric,
  spread_width_m numeric,
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

create table if not exists public.spread_job_products (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  spread_job_id uuid not null references public.spread_jobs(id) on delete cascade,
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

create index if not exists spread_jobs_business_id_idx on public.spread_jobs(business_id);
create index if not exists spread_jobs_status_idx on public.spread_jobs(status);
create index if not exists spread_jobs_deleted_at_idx on public.spread_jobs(deleted_at);
create index if not exists spread_job_products_spread_job_id_idx on public.spread_job_products(spread_job_id);

alter table public.spread_jobs enable row level security;
alter table public.spread_job_products enable row level security;

drop policy if exists "spread_jobs_select" on public.spread_jobs;
drop policy if exists "spread_jobs_insert" on public.spread_jobs;
drop policy if exists "spread_jobs_update" on public.spread_jobs;
drop policy if exists "spread_jobs_delete" on public.spread_jobs;

create policy "spread_jobs_select" on public.spread_jobs for select using (
  is_business_member(business_id)
);
create policy "spread_jobs_insert" on public.spread_jobs for insert with check (
  is_business_member(business_id)
);
create policy "spread_jobs_update" on public.spread_jobs for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "spread_jobs_delete" on public.spread_jobs for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

drop policy if exists "spread_job_products_select" on public.spread_job_products;
drop policy if exists "spread_job_products_insert" on public.spread_job_products;
drop policy if exists "spread_job_products_update" on public.spread_job_products;
drop policy if exists "spread_job_products_delete" on public.spread_job_products;

create policy "spread_job_products_select" on public.spread_job_products for select using (
  is_business_member(business_id)
);
create policy "spread_job_products_insert" on public.spread_job_products for insert with check (
  is_business_member(business_id)
);
create policy "spread_job_products_update" on public.spread_job_products for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "spread_job_products_delete" on public.spread_job_products for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

-- Realtime: match spray_jobs/spray_job_products so useRealtime(["spread_jobs", "spread_job_products"], ...) works.
alter publication supabase_realtime add table public.spread_jobs;
alter publication supabase_realtime add table public.spread_job_products;

-- Spread jobs deduct stock on completion just like spray jobs
-- (previewDeductions/applyDeductions in stock.ts) — give stock_movements its
-- own nullable FK to link a deduction back to the spread job that caused it,
-- parallel to the existing spray_job_id column.
alter table public.stock_movements add column if not exists spread_job_id uuid references public.spread_jobs(id) on delete set null;
