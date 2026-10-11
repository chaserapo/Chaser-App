-- Client-side error logging table
-- ─────────────────────────────────────────────────────────────────────────
-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query).
--
-- JS-only replacement for @sentry/react-native, which was removed after its
-- Session Replay Fabric component crashed the app on every launch (see the
-- PR that removed it, #24). This has no native code and nothing autolinked —
-- it's just the app's existing Supabase client writing a row when
-- ErrorBoundary catches a render crash, or the global JS exception handler
-- catches an uncaught error. See frontend/src/lib/error-log.ts.
--
-- This table has no SELECT policy on purpose — the app never reads it back,
-- only inserts. View it via the Supabase dashboard's Table Editor (which
-- runs as the project owner and bypasses RLS), or query it with the
-- service_role key from the backend if you want a dashboard/alerting job
-- later.

create table if not exists client_error_logs (
  id text primary key,
  kind text not null,           -- "render" | "js_exception"
  message text not null,
  stack text,
  extra text,                   -- componentStack for render errors, "fatal"/"non-fatal" for js_exception
  platform text,                -- "ios" | "android"
  app_version text,
  created_at timestamptz not null default now()
);

create index if not exists client_error_logs_created_at_idx on client_error_logs(created_at desc);

alter table client_error_logs enable row level security;

-- Errors can happen before a user is signed in (e.g. a crash on the auth
-- screen itself), so inserts are allowed for both anon and authenticated
-- roles. No SELECT policy is defined — the client never reads this table,
-- only the dashboard/service_role does, both of which bypass RLS.
create policy "client_error_logs_insert_any" on client_error_logs
  for insert to anon, authenticated
  with check (true);
