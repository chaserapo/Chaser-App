-- Push tokens + notification log
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)
-- if `push_tokens` and/or `notification_log` are missing from Table Editor.
--
-- Both the maintenance/fault cron (backend/routes/alerts_cron.py) and the
-- weather alerts cron (backend/routes/weather_alerts_cron.py) assume these
-- two tables already exist — CREATE_WEATHER_ALERTS_TABLE.sql said as much
-- ("should already exist from that feature"), but if push notifications
-- aren't arriving, this is the same root cause as the weather_alerts gap:
-- the tables were never actually created in the live database.

-- One row per device registered for push notifications (frontend upserts
-- this itself — see frontend/src/lib/push-tokens.ts — on conflict of the
-- Expo push token itself, so re-registering the same device updates in place).
create table if not exists push_tokens (
  token text primary key,
  business_id uuid not null,
  user_id uuid not null,
  platform text not null,        -- "ios" | "android" | "web"
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_business_id_idx on push_tokens(business_id);
create index if not exists push_tokens_user_id_idx on push_tokens(user_id);

alter table push_tokens enable row level security;

-- A user registers/updates only their own device's token.
create policy "push_tokens_insert_own" on push_tokens
  for insert with check (user_id = auth.uid());

create policy "push_tokens_update_own" on push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push_tokens_select_own" on push_tokens
  for select using (user_id = auth.uid());

create policy "push_tokens_delete_own" on push_tokens
  for delete using (user_id = auth.uid());

-- One row per (kind, ref_id) alert that has already been pushed, so the
-- cron jobs never notify the same overdue service / open fault / weather
-- condition twice. Only ever written by the backend crons using the
-- service_role key (which bypasses RLS), so no client-facing policies
-- are needed — RLS is enabled purely to keep it out of the anon/authenticated
-- default-deny-less posture.
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  kind text not null,            -- "overdue_maintenance" | "open_fault" | "wx_rain_after_spray" | ...
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  unique (kind, ref_id)
);

create index if not exists notification_log_business_id_idx on notification_log(business_id);

alter table notification_log enable row level security;
