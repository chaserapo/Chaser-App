-- Cost tracking + resistance/MoA rotation warning
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- What this does:
--   1. Adds a constrained mode-of-action group key and a $ cost-per-unit to
--      chemicals — chemical_group stays as-is (existing free text, still
--      shown read-only for chemicals nobody has re-picked a group for yet).
--   2. Adds the same group + cost fields (plus cost_unit, the stock_unit the
--      cost was denominated in at the time) to spray_job_products, since a
--      job's product row is a point-in-time snapshot of the chemical
--      register at the moment it was added to that job, not a live lookup —
--      the same reasoning already used for chemical_name on this table.
--
-- All columns are additive and nullable — nothing is backfilled. Existing
-- rows simply have no group/cost data until a chemical is re-saved with it
-- (mirrors how chemical_name denormalization already works on this table).

alter table chemicals add column if not exists chemical_group_key text;
alter table chemicals add column if not exists cost_per_unit numeric;

alter table spray_job_products add column if not exists chemical_group text;
alter table spray_job_products add column if not exists cost_per_unit numeric;
alter table spray_job_products add column if not exists cost_unit text;
