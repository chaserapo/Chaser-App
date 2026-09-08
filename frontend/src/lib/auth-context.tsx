import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { setBackend } from "./backend";
import { isMigrated, runMigration, MigrationProgress } from "./migrate";
import { acceptPendingInvitations } from "./members";

export type ActiveBusiness = { id: string; name: string; role: "owner" | "manager" | "operator" };
export type MigrationState =
  | { kind: "idle" }
  | { kind: "running"; progress: MigrationProgress }
  | { kind: "success"; rowsMigrated: number; tablesMigrated: number }
  | { kind: "error"; message: string };

type Ctx = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  business: ActiveBusiness | null;
  migration: MigrationState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, businessName: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryMigration: () => Promise<void>;
  clearMigrationSuccess: () => void;
  renameBusiness: (newName: string) => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth must be inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [business, setBusiness] = useState<ActiveBusiness | null>(null);
  const [migration, setMigration] = useState<MigrationState>({ kind: "idle" });
  const pendingSignupBusinessName = useRef<string | null>(null);

  // Resolve or create the business for the signed-in user, then run migration if needed.
  const bootstrapBusiness = useCallback(async (u: User) => {
    // 0) Redeem any pending invitations for this user's email — this may add a
    //    membership row before we probe below. Safe idempotent RPC.
    let acceptedInvites = 0;
    try { acceptedInvites = await acceptPendingInvitations(); }
    catch (e) { console.warn("accept invites failed", e); }

    // 1) Do we already have a membership?
    const { data: members, error: memErr } = await supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", u.id)
      .limit(1);
    if (memErr) throw memErr;

    let biz: ActiveBusiness;
    let isFreshBusiness = false;
    if (members && members.length > 0) {
      const m = members[0];
      const { data: bz, error: bzErr } = await supabase.from("businesses").select("id, name").eq("id", m.business_id).maybeSingle();
      if (bzErr) throw bzErr;
      if (!bz) throw new Error("Business record missing.");
      biz = { id: bz.id, name: bz.name, role: m.role as ActiveBusiness["role"] };
    } else {
      // Fresh account — must create the business. Use pending signup name if we have it,
      // otherwise fall back to a friendly default (user can rename in Account later).
      const businessName = pendingSignupBusinessName.current || "My Farm";
      pendingSignupBusinessName.current = null;
      const bId = uuid();
      const { error: insBizErr } = await supabase
        .from("businesses")
        .insert({ id: bId, owner_id: u.id, name: businessName });
      if (insBizErr) throw insBizErr;
      const { error: insMemErr } = await supabase
        .from("business_members")
        .insert({ id: uuid(), business_id: bId, user_id: u.id, role: "owner" });
      if (insMemErr) throw insMemErr;
      biz = { id: bId, name: businessName, role: "owner" };
      isFreshBusiness = true;
    }

    // 2) Migration — ONLY on the device where the business was just created (signup as an owner).
    //    Invited users (acceptedInvites > 0) join an existing business and MUST NOT
    //    upload their local seed data into someone else's workspace.
    const already = await isMigrated(u.id, biz.id);
    if (isFreshBusiness && acceptedInvites === 0 && !already) {
      setMigration({ kind: "running", progress: { step: "Starting…", uploaded: 0, totalTables: 0, completedTables: 0 } });
      try {
        const result = await runMigration(u.id, biz.id, (p) => setMigration({ kind: "running", progress: p }));
        setMigration({ kind: "success", rowsMigrated: result.rowsMigrated, tablesMigrated: result.tablesMigrated });
      } catch (e: any) {
        setMigration({ kind: "error", message: e?.message ?? "Migration failed" });
        // Don't proceed to cloud mode on migration failure — keep local as source of truth.
        return;
      }
    }

    // 3) Activate cloud backend now that we have a business (and migration succeeded/was skipped).
    setBackend("cloud", biz.id);
    setBusiness(biz);
  }, []);

  // Boot: load persisted session, subscribe to auth changes.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        try { await bootstrapBusiness(data.session.user); }
        catch (e) { console.warn("bootstrapBusiness failed:", e); }
      }
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (event === "SIGNED_IN" && s?.user) {
        try { await bootstrapBusiness(s.user); }
        catch (e: any) {
          console.warn("bootstrapBusiness failed:", e);
          setMigration({ kind: "error", message: e?.message ?? "Setup failed" });
        }
      }
      if (event === "SIGNED_OUT") {
        setBusiness(null);
        setMigration({ kind: "idle" });
        setBackend("local", null);
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [bootstrapBusiness]);

  // React to remote business changes (rename by another owner device, role change,
  // or removal from the business by an owner). Keeps every device honest without
  // requiring a manual refresh.
  useEffect(() => {
    if (!business) return;
    const channel = supabase.channel(`biz-${business.id}`);
    channel.on(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "postgres_changes" as any,
      { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${business.id}` },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (payload: any) => {
        const next = payload?.new;
        if (next?.name && next.name !== business.name) {
          setBusiness((b) => (b ? { ...b, name: next.name } : b));
        }
      },
    );
    if (session?.user) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "business_members", filter: `business_id=eq.${business.id}` },
        async () => {
          // Membership may have been revoked or role changed — re-probe the row.
          const { data: mem } = await supabase
            .from("business_members")
            .select("role")
            .eq("business_id", business.id)
            .eq("user_id", session.user!.id)
            .maybeSingle();
          if (!mem) {
            // We've been removed — sign out to force a clean state.
            await supabase.auth.signOut();
            return;
          }
          if (mem.role !== business.role) {
            setBusiness((b) => (b ? { ...b, role: mem.role as ActiveBusiness["role"] } : b));
          }
        },
      );
    }
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business, session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, businessName: string) => {
    pendingSignupBusinessName.current = businessName.trim() || "My Farm";
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      pendingSignupBusinessName.current = null;
      throw error;
    }
    // If Supabase has "Confirm email" enabled, signUp succeeds but no session is returned.
    // Surface that clearly to the user instead of leaving them on a silent stuck screen.
    if (!data.session) {
      pendingSignupBusinessName.current = null;
      throw new Error(
        "Account created, but this Supabase project requires email confirmation. " +
        "Ask the owner to disable it in Authentication → Sign In / Providers → Email → Confirm email, then sign in."
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const retryMigration = useCallback(async () => {
    const u = session?.user;
    if (!u) return;
    setMigration({ kind: "idle" });
    try { await bootstrapBusiness(u); }
    catch (e: any) { setMigration({ kind: "error", message: e?.message ?? "Migration failed" }); }
  }, [session, bootstrapBusiness]);

  const clearMigrationSuccess = useCallback(() => {
    if (migration.kind === "success") setMigration({ kind: "idle" });
  }, [migration]);

  const renameBusiness = useCallback(async (newName: string) => {
    const name = newName.trim();
    if (!business) throw new Error("No active business");
    if (!name) throw new Error("Business name cannot be empty");
    if (business.role !== "owner") throw new Error("Only the owner can rename the business");
    const { error } = await supabase.from("businesses").update({ name }).eq("id", business.id);
    if (error) throw error;
    setBusiness({ ...business, name });
  }, [business]);

  const value = useMemo<Ctx>(() => ({
    loading,
    session,
    user: session?.user ?? null,
    business,
    migration,
    signIn, signUp, signOut, retryMigration, clearMigrationSuccess, renameBusiness,
  }), [loading, session, business, migration, signIn, signUp, signOut, retryMigration, clearMigrationSuccess, renameBusiness]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
