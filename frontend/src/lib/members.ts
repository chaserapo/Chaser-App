// Members & invitations — Supabase repository helpers.
// Owner-only mutations are enforced by RLS; UI still gates the buttons for clarity.

import { v4 as uuid } from "uuid";
import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";

export type MemberRole = "owner" | "manager" | "operator";

export type BusinessMember = {
  user_id: string;
  email: string;
  role: MemberRole;
  created_at: string;
};

export type MemberInvitation = {
  id: string;
  business_id: string;
  email: string;
  role: "manager" | "operator";
  invited_by: string;
  invited_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
};

function bid(): string {
  const id = getActiveBusinessId();
  if (!id) throw new Error("No active business");
  return id;
}

export const membersRepo = {
  async list(): Promise<BusinessMember[]> {
    const { data, error } = await supabase.rpc("list_business_members", { p_business_id: bid() });
    if (error) throw error;
    return (data ?? []) as BusinessMember[];
  },

  async updateRole(userId: string, role: "manager" | "operator"): Promise<void> {
    const { error } = await supabase
      .from("business_members")
      .update({ role })
      .eq("business_id", bid())
      .eq("user_id", userId);
    if (error) throw error;
  },

  async remove(userId: string): Promise<void> {
    const { error } = await supabase
      .from("business_members")
      .delete()
      .eq("business_id", bid())
      .eq("user_id", userId);
    if (error) throw error;
  },
};

export const invitationsRepo = {
  async list(): Promise<MemberInvitation[]> {
    const { data, error } = await supabase
      .from("member_invitations")
      .select("*")
      .eq("business_id", bid())
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("invited_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as MemberInvitation[];
  },

  async invite(email: string, role: "manager" | "operator"): Promise<MemberInvitation> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Not signed in");
    const row = {
      id: uuid(),
      business_id: bid(),
      email: email.trim().toLowerCase(),
      role,
      invited_by: u.user.id,
      invited_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("member_invitations")
      .upsert({ ...row, accepted_at: null, revoked_at: null }, { onConflict: "business_id,email" })
      .select()
      .single();
    if (error) throw error;
    // Fire-and-forget email. If the email service fails we still keep the invite
    // (owner can Resend). We surface errors to caller so UI can hint about it.
    try { await sendInvitationEmail(data.id); }
    catch (e) { console.warn("Invitation email failed:", e); }
    return data as MemberInvitation;
  },

  async resend(id: string): Promise<void> {
    const { error } = await supabase
      .from("member_invitations")
      .update({ invited_at: new Date().toISOString(), revoked_at: null })
      .eq("id", id)
      .eq("business_id", bid());
    if (error) throw error;
    try { await sendInvitationEmail(id); }
    catch (e) { console.warn("Resend email failed:", e); }
  },

  async revoke(id: string): Promise<void> {
    const { error } = await supabase
      .from("member_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("business_id", bid());
    if (error) throw error;
  },
};

// Called during auth bootstrap: silently redeems any pending invitations
// matching the current user's email. Returns count accepted.
export async function acceptPendingInvitations(): Promise<number> {
  const { data, error } = await supabase.rpc("accept_pending_invitations");
  if (error) {
    console.warn("accept_pending_invitations error:", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}

// Fire the backend endpoint that sends the actual invitation email via Emergent-managed Resend.
// The backend re-validates the caller's authority via RLS using the same JWT.
export async function sendInvitationEmail(invitationId: string): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess.session?.access_token;
  if (!jwt) throw new Error("Not signed in");
  const base = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";
  const url = `${base.replace(/\/$/, "")}/api/invitations/${invitationId}/send-email`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`Email failed (${r.status}): ${text}`);
  }
}
