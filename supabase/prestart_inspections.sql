-- Pre-start inspection schema. The table is already referenced by
-- frontend/src/lib/team.ts (a team member's activity view reads it) and
-- backend/routes/account.py (listed for account-deletion purge), but there
-- was never a create-flow anywhere in the app — this migration is what
-- that existing read path assumed already existed. Written defensively
-- (create if missing, add any column that isn't there yet) since there's
-- no tracked migration for whatever shape it was created in originally —
-- same situation spray_jobs was in before supabase/seeding_jobs.sql's
-- comment block documented it. Safe to run whether the table is fully
-- missing, partially there, or already exactly this shape.

create table if not exists public.prestart_inspections (
  id uuid primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  machinery_id uuid references public.machinery(id) on delete set null,
  date text not null,
  created_at timestamptz not null default now()
);

alter table public.prestart_inspections add column if not exists operator_id uuid references public.operators(id) on delete set null;
alter table public.prestart_inspections add column if not exists operator text;
alter table public.prestart_inspections add column if not exists checklist_json text;
alter table public.prestart_inspections add column if not exists passed boolean not null default true;
alter table public.prestart_inspections add column if not exists notes text;
alter table public.prestart_inspections add column if not exists deleted_at timestamptz;

create index if not exists prestart_inspections_business_id_idx on public.prestart_inspections(business_id);
create index if not exists prestart_inspections_machinery_id_idx on public.prestart_inspections(machinery_id);
create index if not exists prestart_inspections_operator_id_idx on public.prestart_inspections(operator_id);
create index if not exists prestart_inspections_deleted_at_idx on public.prestart_inspections(deleted_at);

alter table public.prestart_inspections enable row level security;

drop policy if exists "prestart_inspections_select" on public.prestart_inspections;
drop policy if exists "prestart_inspections_insert" on public.prestart_inspections;
drop policy if exists "prestart_inspections_update" on public.prestart_inspections;
drop policy if exists "prestart_inspections_delete" on public.prestart_inspections;

create policy "prestart_inspections_select" on public.prestart_inspections for select using (
  is_business_member(business_id)
);
create policy "prestart_inspections_insert" on public.prestart_inspections for insert with check (
  is_business_member(business_id)
);
create policy "prestart_inspections_update" on public.prestart_inspections for update using (
  is_business_member(business_id)
) with check (
  is_business_member(business_id)
);
create policy "prestart_inspections_delete" on public.prestart_inspections for delete using (
  business_role(business_id) = ANY (ARRAY['owner'::member_role, 'manager'::member_role])
);

-- Realtime, matching the other job/inspection tables. Guarded (unlike the
-- plain ALTER PUBLICATION in harvest_jobs.sql/spread_jobs.sql) because this
-- table might already exist and already be published, and ALTER
-- PUBLICATION ... ADD TABLE has no IF NOT EXISTS form — it errors on an
-- already-member table instead of no-op'ing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'prestart_inspections'
  ) then
    alter publication supabase_realtime add table public.prestart_inspections;
  end if;
end $$;
