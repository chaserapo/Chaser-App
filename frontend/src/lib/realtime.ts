// Supabase Realtime subscription helper.
// Screens use `useRealtime(tables, deps)` to be notified when any row in the given
// tables changes (Postgres INSERT/UPDATE/DELETE broadcast via realtime replication).
// RLS still gates which events the client actually receives — a user only gets
// changes for rows their JWT can SELECT.

import { useEffect } from "react";
import { supabase } from "./supabase";
import { getBackendMode, getActiveBusinessId } from "./backend";

type Table =
  | "businesses"
  | "business_members"
  | "member_invitations"
  | "machinery"
  | "maintenance_schedules"
  | "maintenance_completions"
  | "chemicals"
  | "chemical_batches"
  | "stock_movements"
  | "spray_jobs"
  | "spray_job_products"
  | "farms"
  | "paddocks"
  | "farm_issues"
  | "operators";

/**
 * Subscribe to realtime changes on one or more tables filtered to the active
 * business. Calls `onChange` when any covered row changes.
 * Cleans up automatically on unmount / when deps change.
 */
export function useRealtime(tables: Table[], onChange: () => void, extraDeps: unknown[] = []) {
  useEffect(() => {
    if (getBackendMode() !== "cloud") return;
    const businessId = getActiveBusinessId();
    if (!businessId) return;

    // Per-mount random suffix — Supabase caches channels by topic, so if this
    // component remounts before removeChannel() has finished awaiting server
    // ack, the old topic is still registered and .on() throws
    // "cannot add postgres_changes callbacks ... after subscribe()".
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase.channel(`rt-${tables.join("_")}-${businessId}-${suffix}`);
    tables.forEach((t) => {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: t, filter: `business_id=eq.${businessId}` },
        () => onChange(),
      );
    });
    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, extraDeps);
}
