-- Chemical stock pack-size lines
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- What this does:
--   1. Creates chemical_stock_lines — a chemical product (the existing
--      `chemicals` row) can now have MULTIPLE concurrent pack-size lines,
--      e.g. "Ester 680" might have both a "110 L" line and a "20 L" line,
--      each with its own quantity-on-hand and storage location.
--   2. Adds stock_line_id to stock_movements so every movement is
--      attributable to a specific pack-size line (needed for accurate
--      point-in-time stock reconstruction later).
--   3. Backfills one stock line per existing chemical from its current
--      pack_size / stock_qty / storage_location columns, so nothing on
--      the chemicals list breaks for data that already exists.
--
-- RLS note: the policies below mirror the same business_id-via-
-- business_members pattern every other table in this schema uses. Before
-- relying on this in production, sanity-check it against the actual policy
-- on your `chemicals` table (Database → Policies in the dashboard) — if
-- yours differs, adjust the USING/WITH CHECK clauses below to match rather
-- than trusting this blind, since I can't read your live policies from here.

-- 1) New table ───────────────────────────────────────────────────────────
create table if not exists chemical_stock_lines (
  id uuid primary key,
  business_id uuid not null,
  chemical_id uuid not null references chemicals(id) on delete cascade,
  pack_size text not null,          -- e.g. "20 L", "110 L", "25 kg"
  qty numeric not null default 0,   -- how many of that pack size are on hand
  location text,                    -- e.g. "Shed 2", "Chemical store — bay 3"
  low_stock_threshold numeric,      -- optional, in units of "qty" (packs), not volume
  notes text,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chemical_stock_lines_chemical_id_idx on chemical_stock_lines(chemical_id);
create index if not exists chemical_stock_lines_business_id_idx on chemical_stock_lines(business_id);

alter table chemical_stock_lines enable row level security;

create policy "chemical_stock_lines_select" on chemical_stock_lines
  for select using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "chemical_stock_lines_insert" on chemical_stock_lines
  for insert with check (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "chemical_stock_lines_update" on chemical_stock_lines
  for update using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  ) with check (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "chemical_stock_lines_delete" on chemical_stock_lines
  for delete using (
    business_id in (select business_id from business_members where user_id = auth.uid())
  );

-- 2) Link stock_movements to a specific line ───────────────────────────────
alter table stock_movements add column if not exists stock_line_id uuid references chemical_stock_lines(id) on delete set null;
create index if not exists stock_movements_stock_line_id_idx on stock_movements(stock_line_id);

-- 3) Backfill — one stock line per existing chemical ───────────────────────
-- Only chemicals that actually have a pack_size recorded get a line; ones
-- with nothing set are left alone (the app treats "no lines yet" as "add
-- your first pack size" rather than assuming zero stock).
insert into chemical_stock_lines (id, business_id, chemical_id, pack_size, qty, location, low_stock_threshold, created_at)
select
  gen_random_uuid(),
  c.business_id,
  c.id,
  c.pack_size,
  coalesce(c.stock_qty, 0),
  c.storage_location,
  c.low_stock_threshold,
  now()
from chemicals c
where c.pack_size is not null
  and c.deleted_at is null
  and not exists (select 1 from chemical_stock_lines l where l.chemical_id = c.id);

-- Existing movements aren't retroactively linked to a stock_line_id (we can't
-- know which pack size an old movement drew from) — they stay valid history
-- against the chemical as a whole, just without a line attribution. New
-- movements going forward will carry stock_line_id.
