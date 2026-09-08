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
  | "paddocks";

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

    const channel = supabase.channel(`rt-${tables.join("_")}-${businessId}`);
    tables.forEach((t) => {
      channel.on(
        // The postgres_changes payload type is generic; we don't need the row body,
        // just the notification — screens re-fetch via repo (which honours RLS).
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
