-- Weather alerts table
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- The Weather alerts screen (app/weather/alerts.tsx) and the backend cron
-- job (backend/routes/weather_alerts_cron.py) both already assume this
-- table exists with these exact columns — it was just never created in the
-- live database, which is why toggling an alert on failed with
-- "Could not find the table 'public.weather_alerts' in the schema cache".
--
-- push_tokens and notification_log (also used by the alert crons) are not
-- created here since they're shared with the existing maintenance/fault
-- alert cron (alerts_cron.py) and should already exist from that feature.

create table if not exists weather_alerts (
  id uuid primary key,
  business_id uuid not null,
  user_id uuid not null,
  farm_id uuid,
  kind text not null,           -- "spray_window" | "rain_after_spray" | "frost" | "wind_max" | "rain_change"
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists weather_alerts_business_id_idx on weather_alerts(business_id);
create index if not exists weather_alerts_user_id_idx on weather_alerts(user_id);
create index if not exists weather_alerts_enabled_idx on weather_alerts(enabled) where enabled = true;

alter table weather_alerts enable row level security;

-- Alerts are per-user (the app's own UI text: "Alerts are stored per-user,
-- scoped to your business") — a user can only see/manage their own, not
-- other business members'. The backend cron reads all enabled alerts using
-- the service_role key, which bypasses RLS entirely, so this doesn't affect it.
create policy "weather_alerts_select_own" on weather_alerts
  for select using (user_id = auth.uid());

create policy "weather_alerts_insert_own" on weather_alerts
  for insert with check (
    user_id = auth.uid()
    and business_id in (select business_id from business_members where user_id = auth.uid())
  );

create policy "weather_alerts_update_own" on weather_alerts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "weather_alerts_delete_own" on weather_alerts
  for delete using (user_id = auth.uid());
