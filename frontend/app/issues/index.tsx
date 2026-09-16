import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { reopenFarmIssue, resolveFarmIssue } from "@/src/lib/issues";
import { issueCategoryIcon, issueCategoryLabel } from "@/src/lib/issue-categories";
import type { FarmIssue } from "@/src/lib/types";

const severityColor = (s: string) => s === "critical" ? colors.error : s === "high" ? colors.warning : s === "medium" ? colors.info : colors.success;

export default function IssuesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [issues, setIssues] = useState<FarmIssue[]>([]);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setIssues(await repo.farmIssues.list()); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => issues.filter((i) => tab === "resolved" ? ["resolved", "closed"].includes(i.status) : !["resolved", "closed"].includes(i.status)), [issues, tab]);

  async function toggle(issue: FarmIssue) {
    if (["resolved", "closed"].includes(issue.status)) await reopenFarmIssue(issue);
    else await resolveFarmIssue(issue);
    await load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Faults & Risks" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Button title="Report Issue" icon="alert-plus-outline" onPress={() => router.push("/issues/new")} testID="report-issue-btn" />
        <View style={styles.tabs}>
          {(["open", "resolved"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "open" ? "Open" : "Resolved"}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? <Text style={styles.empty}>Loading…</Text> : shown.length === 0 ? (
          <Card><Text style={styles.empty}>{tab === "open" ? "No open faults or risks." : "No resolved issues yet."}</Text></Card>
        ) : shown.map((issue) => (
          <Card key={issue.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.rowTop}>
              <View style={[styles.categoryIcon, { backgroundColor: severityColor(issue.severity) }]}>
                <Icon name={issueCategoryIcon(issue.category) as any} size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.issueTitle}>{issue.title}</Text>
                <Text style={styles.meta}>{issueCategoryLabel(issue.category)} · {issue.severity.toUpperCase()}</Text>
              </View>
            </View>
            {issue.description ? <Text style={styles.description}>{issue.description}</Text> : null}
            {issue.photo_url ? <Image source={{ uri: issue.photo_url }} style={styles.photo} /> : null}
            <View style={styles.tags}>
              {issue.farms?.name ? <Text style={styles.tag}>Farm: {issue.farms.name}</Text> : null}
              {issue.paddocks?.name ? <Text style={styles.tag}>Paddock: {issue.paddocks.name}</Text> : null}
              {issue.machinery?.name ? <Text style={styles.tag}>Machine: {issue.machinery.name}</Text> : null}
              {issue.latitude != null && issue.longitude != null ? <Text style={styles.tag}>GPS saved</Text> : null}
            </View>
            <View style={{ height: spacing.sm }} />
            <Pressable onPress={() => toggle(issue)} style={styles.resolveBtn}>
              <Icon name={tab === "open" ? "check-circle-outline" : "backup-restore"} size={18} color={tab === "open" ? colors.success : colors.brandPrimary} />
              <Text style={[styles.resolveText, { color: tab === "open" ? colors.success : colors.brandPrimary }]}>{tab === "open" ? "Mark resolved" : "Reopen"}</Text>
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4, marginVertical: spacing.lg },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: radius.pill },
  tabActive: { backgroundColor: colors.surfaceSecondary },
  tabText: { color: colors.muted, fontWeight: "700" },
  tabTextActive: { color: colors.onSurface },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: spacing.lg },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  categoryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: 160, borderRadius: radius.md, marginTop: spacing.md },
  issueTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  meta: { fontSize: 11, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
  description: { color: colors.onSurfaceTertiary, marginTop: spacing.md, lineHeight: 20 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md },
  tag: { fontSize: 11, color: colors.onSurfaceTertiary, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  resolveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 42, borderTopWidth: 1, borderTopColor: colors.border },
  resolveText: { fontWeight: "800", fontSize: 13, paddingTop: spacing.sm },
});
