import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { useAuth } from "@/src/lib/auth-context";
import { confirm } from "@/src/lib/confirm";
import { membersRepo, invitationsRepo, BusinessMember, MemberInvitation } from "@/src/lib/members";
import { useRealtime } from "@/src/lib/realtime";

type Role = "manager" | "operator";

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const { user, business } = useAuth();
  const isOwner = business?.role === "owner";
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [invites, setInvites] = useState<MemberInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([membersRepo.list(), invitationsRepo.list()]);
      setMembers(m);
      setInvites(i);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load team");
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(
    ["business_members", "member_invitations"],
    load,
    [load],
  );

  async function sendInvite() {
    setError(null); setNotice(null);
    const email = inviteEmail.trim().toLowerCase();
    if (!email) { setError("Enter an email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("That doesn't look like an email address."); return; }
    if (members.some((m) => m.email.toLowerCase() === email)) { setError("That user is already in the team."); return; }
    setBusy(true);
    try {
      await invitationsRepo.invite(email, inviteRole);
      setInviteEmail("");
      setNotice(`Invitation sent to ${email} as ${inviteRole}. They'll join automatically after signing up.`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to send invite");
    } finally { setBusy(false); }
  }

  async function changeRole(m: BusinessMember, next: Role) {
    if (m.user_id === user?.id) { setError("You can't change your own role."); return; }
    try { await membersRepo.updateRole(m.user_id, next); await load(); }
    catch (e: any) { setError(e?.message ?? "Failed to update role"); }
  }

  function confirmRemove(m: BusinessMember) {
    if (m.user_id === user?.id) { setError("You can't remove yourself."); return; }
    confirm({
      title: "Remove member",
      message: `Remove ${m.email} from ${business?.name}? They'll lose access immediately.`,
      confirmLabel: "Remove",
      destructive: true,
    }, async () => {
      try { await membersRepo.remove(m.user_id); await load(); setNotice(`${m.email} removed.`); }
      catch (e: any) { setError(e?.message ?? "Failed to remove"); }
    });
  }

  async function resendInvite(inv: MemberInvitation) {
    try { await invitationsRepo.resend(inv.id); setNotice(`Invitation to ${inv.email} refreshed.`); await load(); }
    catch (e: any) { setError(e?.message ?? "Failed to resend"); }
  }

  async function revokeInvite(inv: MemberInvitation) {
    confirm({
      title: "Revoke invitation",
      message: `Cancel the invite for ${inv.email}?`,
      confirmLabel: "Revoke",
      cancelLabel: "Keep it",
      destructive: true,
    }, async () => {
      try { await invitationsRepo.revoke(inv.id); setNotice(`Invitation to ${inv.email} revoked.`); await load(); }
      catch (e: any) { setError(e?.message ?? "Failed to revoke"); }
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Team Members" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.pretitle}>{business?.name ?? ""}</Text>
          <Text style={styles.title}>Team Members</Text>
          <Text style={styles.sub}>
            {members.length} member{members.length === 1 ? "" : "s"} · {invites.length} pending invite{invites.length === 1 ? "" : "s"}
          </Text>

          {notice ? <View style={styles.noticeBox} testID="team-notice"><Icon name="check-circle-outline" size={16} color={colors.brandPrimary} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
          {error ? <View style={styles.errorBox} testID="team-error"><Icon name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View> : null}

          {isOwner ? (
            <>
              <Text style={styles.section}>Invite a team member</Text>
              <Card testID="invite-card">
                <Input label="Email address" value={inviteEmail} onChangeText={setInviteEmail} placeholder="mate@farm.com.au" testID="invite-email" />
                <Text style={styles.roleLabel}>Role</Text>
                <View style={styles.roleRow}>
                  <RoleChip label="Operator" active={inviteRole === "operator"} onPress={() => setInviteRole("operator")} testID="role-operator" />
                  <RoleChip label="Manager" active={inviteRole === "manager"} onPress={() => setInviteRole("manager")} testID="role-manager" />
                </View>
                <Text style={styles.roleHelp}>
                  {inviteRole === "manager"
                    ? "Managers get full CRUD on farms, chemicals, machinery and records. They cannot invite or remove members."
                    : "Operators can view farm info and create/update spray jobs, service completions and machinery hours. They cannot delete records."}
                </Text>
                <View style={{ height: spacing.md }} />
                <Button title="Send invitation" icon="email-plus-outline" onPress={sendInvite} loading={busy} disabled={busy || !inviteEmail} testID="send-invite-btn" />
              </Card>
            </>
          ) : null}

          {invites.length > 0 ? (
            <>
              <Text style={styles.section}>Pending invitations</Text>
              {invites.map((inv) => (
                <Card key={inv.id} style={{ marginBottom: spacing.sm }} testID={`invite-row-${inv.id}`}>
                  <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: "#FEF3C7" }]}><Icon name="email-sync-outline" size={22} color={colors.warning} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{inv.email}</Text>
                      <Text style={styles.meta}>Invited {new Date(inv.invited_at).toLocaleDateString()} · {inv.role}</Text>
                    </View>
                    <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>PENDING</Text></View>
                  </View>
                  {isOwner ? (
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => resendInvite(inv)} style={styles.linkBtn} testID={`resend-${inv.id}`}>
                        <Icon name="refresh" size={14} color={colors.brandPrimary} />
                        <Text style={styles.linkBtnText}>Resend</Text>
                      </Pressable>
                      <Pressable onPress={() => revokeInvite(inv)} style={styles.linkBtn} testID={`revoke-${inv.id}`}>
                        <Icon name="close-circle-outline" size={14} color={colors.error} />
                        <Text style={[styles.linkBtnText, { color: colors.error }]}>Revoke</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              ))}
            </>
          ) : null}

          <Text style={styles.section}>Active members</Text>
          {members.length === 0 ? (
            <Card><Text style={styles.empty}>No members yet.</Text></Card>
          ) : (
            members.map((m) => {
              const isMe = m.user_id === user?.id;
              const roleTone = m.role === "owner" ? "brand" : m.role === "manager" ? "info" : "muted";
              return (
                <Card key={m.user_id} style={{ marginBottom: spacing.sm }} testID={`member-row-${m.user_id}`}>
                  <View style={styles.row}>
                    <View style={styles.avatar}><Icon name="account-circle-outline" size={26} color={colors.brandPrimary} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>{m.email}{isMe ? "  (you)" : ""}</Text>
                      <Text style={styles.meta}>Joined {new Date(m.created_at).toLocaleDateString()}</Text>
                    </View>
                    <RoleBadge role={m.role} tone={roleTone as any} testID={`member-role-${m.user_id}`} />
                  </View>
                  {isOwner && !isMe && m.role !== "owner" ? (
                    <View style={styles.actionRow}>
                      {m.role === "operator" ? (
                        <Pressable onPress={() => changeRole(m, "manager")} style={styles.linkBtn} testID={`promote-${m.user_id}`}>
                          <Icon name="arrow-up-bold-circle-outline" size={14} color={colors.brandPrimary} />
                          <Text style={styles.linkBtnText}>Promote to Manager</Text>
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => changeRole(m, "operator")} style={styles.linkBtn} testID={`demote-${m.user_id}`}>
                          <Icon name="arrow-down-bold-circle-outline" size={14} color={colors.brandPrimary} />
                          <Text style={styles.linkBtnText}>Set as Operator</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => confirmRemove(m)} style={styles.linkBtn} testID={`remove-${m.user_id}`}>
                        <Icon name="account-remove-outline" size={14} color={colors.error} />
                        <Text style={[styles.linkBtnText, { color: colors.error }]}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}

          {!isOwner ? (
            <Text style={styles.footer}>
              <Icon name="information-outline" size={12} color={colors.muted} /> Only the owner can invite or remove team members and change roles.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function RoleChip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} style={[styles.roleChip, active && styles.roleChipActive]}>
      <Text style={[styles.roleChipText, active && { color: colors.onBrandPrimary }]}>{label}</Text>
    </Pressable>
  );
}
function RoleBadge({ role, tone, testID }: { role: string; tone: "brand" | "info" | "muted"; testID?: string }) {
  const styleMap = {
    brand: { bg: colors.brandSecondary, fg: colors.onBrandSecondary },
    info: { bg: "#DBEAFE", fg: "#1E40AF" },
    muted: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: styleMap.bg }]} testID={testID}>
      <Text style={[styles.badgeText, { color: styleMap.fg }]}>{role.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pretitle: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4 },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  sub: { color: colors.muted, marginTop: 4, fontSize: 13, marginBottom: spacing.md },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  roleBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  roleBadgeText: { fontSize: 10, fontWeight: "800", color: colors.warning, letterSpacing: 0.4 },
  roleLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  roleRow: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  roleChip: { flex: 1, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  roleChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  roleChipText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary },
  roleHelp: { fontSize: 12, color: colors.muted, lineHeight: 17, fontStyle: "italic" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  empty: { color: colors.muted, textAlign: "center" },
  noticeBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandSecondary, padding: 10, borderRadius: radius.md, marginBottom: spacing.sm },
  noticeText: { color: colors.brandPrimary, fontWeight: "600", fontSize: 13, flex: 1 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md, marginBottom: spacing.sm },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 13, flex: 1 },
  footer: { marginTop: spacing.xl, textAlign: "center", color: colors.muted, fontSize: 12 },
});
