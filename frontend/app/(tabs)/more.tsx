import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { LINK_CATEGORIES } from "@/src/lib/links";
import { useAuth } from "@/src/lib/auth-context";
import { confirm } from "@/src/lib/confirm";
import type { ExternalLink } from "@/src/lib/types";

const TOOLS = [
  { title: "Delta T Calculator", icon: "chart-bell-curve-cumulative", route: "/calculators/delta-t" },
  { title: "Spray Rate Calculator", icon: "calculator", route: "/calculators/spray-rate" },
  { title: "Tank Mix Calculator", icon: "beaker-outline", route: "/calculators/tank-mix" },
  { title: "Nozzle Selection Guide", icon: "sprinkler-variant", route: "/calculators/nozzle-guide" },
  { title: "Farms & Paddocks", icon: "tractor", route: "/farms" },
  { title: "Machinery Maintenance", icon: "wrench-outline", route: "/(tabs)/machinery" },
  { title: "Chemical Register", icon: "flask-outline", route: "/chemicals" },
];

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, business, signOut, renameBusiness } = useAuth();
  const [links, setLinks] = useState<ExternalLink[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { repo.links.list().then(setLinks); }, []));

  function startRename() {
    setNewName(business?.name ?? "");
    setRenameError(null);
    setEditingName(true);
  }
  async function saveRename() {
    setRenameError(null);
    if (!newName.trim()) { setRenameError("Name can't be empty."); return; }
    setRenameBusy(true);
    try {
      await renameBusiness(newName);
      setEditingName(false);
    } catch (e: any) {
      setRenameError(e?.message ?? "Rename failed");
    } finally { setRenameBusy(false); }
  }

  function confirmSignOut() {
    confirm({
      title: "Sign out",
      message: "You'll be signed out of the cloud. Your local backup stays on this device.",
      confirmLabel: "Sign out",
      destructive: true,
    }, () => { signOut(); });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.sub}>Tools & external resources</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {user ? (
          <>
            <Text style={styles.sectionTitle}>Account</Text>
            <Card testID="account-card">
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.accountIcon}><Icon name="account-circle-outline" size={30} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  {editingName ? (
                    <Input
                      value={newName}
                      onChangeText={setNewName}
                      autoCapitalize="words"
                      placeholder="Farm / Business name"
                      testID="rename-input"
                    />
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.accountName} numberOfLines={1} testID="account-business-name">
                        {business?.name ?? "My Farm"}
                      </Text>
                      {business?.role === "owner" ? (
                        <Pressable onPress={startRename} style={{ marginLeft: 8 }} testID="rename-btn" hitSlop={8}>
                          <Icon name="pencil-outline" size={16} color={colors.brandPrimary} />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                  <Text style={styles.accountEmail} numberOfLines={1}>{user.email}</Text>
                  {business?.role ? (
                    <View style={styles.roleChip}>
                      <Text style={styles.roleChipText}>{business.role.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cloudBadge}>
                  <Icon name="cloud-check-outline" size={14} color={colors.brandPrimary} />
                  <Text style={styles.cloudBadgeText}>Synced</Text>
                </View>
              </View>
              {editingName ? (
                <>
                  {renameError ? <Text style={{ color: colors.error, fontSize: 12, marginTop: spacing.sm }}>{renameError}</Text> : null}
                  <View style={{ height: spacing.sm }} />
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Button title="Save" icon="content-save-outline" onPress={saveRename} loading={renameBusy} disabled={renameBusy || !newName.trim()} testID="save-rename-btn" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button title="Cancel" variant="outline" onPress={() => setEditingName(false)} testID="cancel-rename-btn" />
                    </View>
                  </View>
                </>
              ) : null}
              <View style={{ height: spacing.md }} />
              <Pressable onPress={confirmSignOut} style={styles.signOutBtn} testID="sign-out-btn">
                <Icon name="logout-variant" size={18} color={colors.error} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </Card>

            <Text style={styles.sectionTitle}>Team</Text>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <Pressable onPress={() => router.push("/team")} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} testID="open-team-btn">
                <Icon name="account-group-outline" size={22} color={colors.brandPrimary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.rowText, { marginLeft: 0 }]}>Team Members</Text>
                  <Text style={styles.rowSub}>
                    {business?.role === "owner"
                      ? "Invite and manage the people on your farm"
                      : "View who's on this farm"}
                  </Text>
                </View>
                <Icon name="chevron-right" size={22} color={colors.muted} />
              </Pressable>
              {business?.role === "owner" ? (
                <Pressable onPress={() => router.push("/team")} style={({ pressed }) => [styles.row, styles.rowBorder, { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.border }, pressed && { backgroundColor: colors.surface }]} testID="invite-team-btn">
                  <Icon name="email-plus-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.rowText}>Invite team member</Text>
                  <Icon name="chevron-right" size={22} color={colors.muted} />
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Tools</Text>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Pressable onPress={() => router.push("/chemicals")} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]} testID="open-chemicals-btn">
            <Icon name="flask-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Chemicals</Text>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        </Card>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {TOOLS.map((t, i) => (
            <Pressable
              key={t.title}
              onPress={() => router.push(t.route as any)}
              testID={`tool-link-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              style={({ pressed }) => [styles.row, i < TOOLS.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
            >
              <Icon name={t.icon as any} size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{t.title}</Text>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </Card>

        {LINK_CATEGORIES.map((cat) => {
          const linksInCat = links.filter((l) => l.category === cat);
          if (linksInCat.length === 0) return null;
          return (
            <View key={cat}>
              <View style={styles.linkSectionHeader}>
                <Text style={styles.sectionTitle}>{cat}</Text>
                <Pressable onPress={() => router.push({ pathname: "/links", params: { cat } })} testID={`manage-${cat}`}>
                  <Text style={styles.manage}>Manage</Text>
                </Pressable>
              </View>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                {linksInCat.map((l, i) => (
                  <Pressable
                    key={l.id}
                    onPress={() => Linking.openURL(l.url)}
                    testID={`ext-link-${l.name.replace(/\s+/g, "-")}`}
                    style={({ pressed }) => [styles.row, i < linksInCat.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
                  >
                    <Icon name="open-in-new" size={20} color={colors.brandPrimary} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.rowText, { marginLeft: 0 }]}>{l.name}</Text>
                      {l.description ? <Text style={styles.rowSub}>{l.description}</Text> : null}
                    </View>
                    <Icon name="chevron-right" size={22} color={colors.muted} />
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>About</Text>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Pressable
            onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: "privacy" } })}
            testID="link-privacy"
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
          >
            <Icon name="shield-lock-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Privacy Policy</Text>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: "terms" } })}
            testID="link-terms"
            style={({ pressed }) => [styles.row, styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
          >
            <Icon name="file-document-outline" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Terms & Agricultural Disclaimer</Text>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: "/legal/[slug]", params: { slug: "support" } })}
            testID="link-support"
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}
          >
            <Icon name="lifebuoy" size={22} color={colors.brandPrimary} />
            <Text style={styles.rowText}>Help & Support</Text>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        </Card>

        <View style={{ height: spacing.md }} />
        <Pressable onPress={() => router.push("/links")} testID="manage-all-links-btn" style={styles.manageBtn}>
          <Icon name="playlist-edit" size={20} color={colors.brandPrimary} />
          <Text style={styles.manageBtnText}>Manage Links</Text>
        </Pressable>

        <Text style={styles.footer}>Chaser · Behind every good operation · v1.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  linkSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  manage: { fontSize: 13, fontWeight: "700", color: colors.brandPrimary, marginTop: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 56, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface, marginLeft: 12 },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  manageBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, height: 48 },
  manageBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  footer: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, fontSize: 12 },
  accountIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  accountName: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  accountEmail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  roleChip: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4 },
  roleChipText: { fontSize: 9, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.4 },
  cloudBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandSecondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  cloudBadgeText: { fontSize: 11, fontWeight: "700", color: colors.brandPrimary },
  signOutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, height: 44, backgroundColor: colors.surface },
  signOutText: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
