-- Weather source on spray records + rainfast period on chemicals
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- What this does:
--   1. Records where a spray job's starting weather came from: 'forecast'
--      (auto-captured), 'dpird' (a DPIRD station's measured reading) or
--      'manual' (typed by the operator), plus the station name and distance
--      when it's a DPIRD reading.
--   2. Adds an optional rainfast period (hours, from the product label) to
--      chemicals, used to warn about forecast rain when starting a spray.
--
-- All columns are additive and nullable. Records saved before this have no
-- source. The app keeps saving without these columns until this has been run.

alter table spray_jobs add column if not exists weather_source text
  check (weather_source in ('forecast', 'dpird', 'manual'));
alter table spray_jobs add column if not exists weather_station text;

alter table chemicals add column if not exists rainfast_hours numeric
  check (rainfast_hours >= 0);
