// Onboarding profile + progress state for Chaser.
//
// Backed by public.user_profiles in Supabase (see migration in this session).
// The wizard is only forced on brand-new users: existing beta accounts are
// backfilled with onboarding_completed_at = now() so they never see it.
//
// This module uses React Query so every consumer of `useOnboarding` shares one
// cache entry — that way when the More tab (or Home) calls profileRepo.resume(),
// the AuthGate in _layout immediately re-renders into <Onboarding/> without a
// stale-hook race.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import { queryClient } from "@/src/query-client";

export type OnboardingRole = "owner" | "manager" | "contractor" | "other";

export const ONBOARDING_STEPS = [
  "role",
  "team",
  "farms",
  "paddocks",
  "machinery",
  "chemicals",
  "finish",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingProgress = Partial<Record<OnboardingStep, {
  done?: boolean;
  skipped?: boolean;
  at?: string;
}>>;

export type UserProfile = {
  user_id: string;
  role?: OnboardingRole | null;
  onboarding_completed_at?: string | null;
  onboarding_progress?: OnboardingProgress;
};

const PROFILE_KEY = (userId: string | null) => ["user_profile", userId] as const;

async function readProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, role, onboarding_completed_at, onboarding_progress")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as UserProfile) ?? null;
}

async function ensureProfile(userId: string): Promise<UserProfile> {
  const existing = await readProfile(userId);
  if (existing) return existing;
  // First-run insert. Empty progress; onboarding_completed_at stays null so the
  // brand-new user is routed into the wizard.
  const row: UserProfile = { user_id: userId, onboarding_progress: {} };
  const { error: insErr } = await supabase.from("user_profiles").insert(row);
  // 23505 = unique violation (row created by a race with the previous read); safe to ignore.
  if (insErr && (insErr as any).code !== "23505") throw insErr;
  const after = await readProfile(userId);
  return after ?? row;
}

function invalidate(userId: string) {
  return queryClient.invalidateQueries({ queryKey: PROFILE_KEY(userId) });
}

export const profileRepo = {
  async get(userId: string): Promise<UserProfile> {
    return await ensureProfile(userId);
  },
  async setRole(userId: string, role: OnboardingRole) {
    // Upsert so we don't depend on a previously-inserted row (guards against
    // any RLS/insert race). Requires both INSERT and UPDATE policies on
    // user_profiles — see migration.
    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        { user_id: userId, role, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    await invalidate(userId);
  },
  async markStep(userId: string, step: OnboardingStep, patch: { done?: boolean; skipped?: boolean }) {
    const current = await ensureProfile(userId);
    const progress: OnboardingProgress = { ...(current.onboarding_progress ?? {}) };
    progress[step] = { ...(progress[step] ?? {}), ...patch, at: new Date().toISOString() };
    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        { user_id: userId, onboarding_progress: progress, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    await invalidate(userId);
  },
  async complete(userId: string) {
    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        { user_id: userId, onboarding_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    await invalidate(userId);
  },
  async resume(userId: string) {
    // Clearing completed_at flips the gate back to the wizard.
    const { error } = await supabase
      .from("user_profiles")
      .upsert(
        { user_id: userId, onboarding_completed_at: null, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    await invalidate(userId);
  },
};

/**
 * Hook returning the current user's onboarding state via a single shared
 * React Query cache entry so every consumer stays in lock-step.
 */
export function useOnboarding() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: PROFILE_KEY(userId),
    queryFn: async () => (userId ? await ensureProfile(userId) : null),
    enabled: !!userId,
    staleTime: 30_000,
  });

  const reload = useCallback(async () => {
    if (!userId) return;
    await qc.invalidateQueries({ queryKey: PROFILE_KEY(userId) });
  }, [qc, userId]);

  const profile = q.data ?? null;
  const needsOnboarding = !!userId && !!profile && !profile.onboarding_completed_at;
  const progress = profile?.onboarding_progress ?? {};
  const percent = (() => {
    // Only "done" counts toward completion — "skipped" leaves the step in an
    // incomplete state so the user can be nudged back via the Home banner.
    const totalReal = ONBOARDING_STEPS.length - 1; // exclude 'finish'
    let hit = 0;
    for (const s of ONBOARDING_STEPS) {
      if (s === "finish") continue;
      if (progress[s]?.done) hit += 1;
    }
    return Math.round((hit / totalReal) * 100);
  })();

  return {
    userId,
    profile,
    loading: q.isLoading,
    error: q.error ? String((q.error as any)?.message ?? q.error) : null,
    reload,
    needsOnboarding,
    percent,
    progress,
  };
}
