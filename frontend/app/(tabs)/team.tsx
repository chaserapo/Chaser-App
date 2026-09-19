import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { listTeamMembers, type TeamMember } from "@/src/lib/team";
import { listTasks, type Task } from "@/src/lib/tasks";

export default function TeamTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([listTeamMembers(true), listTasks()]);
      setMembers(m);
      setTasks(t);
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => members.filter((m) => showInactive || !m.archived_at), [members, showInactive]);
  const activeCount = members.filter((m) => !m.archived_at).length;
  const openTaskCount = tasks.filter((t) => t.status !== "done").length;
  const openTasksByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === "done" || !t.assigned_to) continue;
      map.set(t.assigned_to, (map.get(t.assigned_to) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team</Text>
          <Text style={styles.sub}>People, skills & work history</Text>
        </View>
        <View style={styles.countBadge}><Text style={styles.countText}>{activeCount} active</Text></View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Button title="Add Team Member" icon="account-plus-outline" onPress={() => router.push("/team/new")} testID="add-team-member-btn" />
        <View style={{ height: spacing.sm }} />
        <Pressable onPress={() => router.push("/tasks")} testID="team-tasks-entry">
          <Card style={styles.tasksCard}>
            <View style={styles.tasksIcon}><Icon name="clipboard-check-outline" size={22} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tasksTitle}>Tasks</Text>
              <Text style={styles.meta}>{openTaskCount} open · assign work or leave it open for anyone</Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </Card>
        </Pressable>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Team members</Text>
          <Pressable onPress={() => setShowInactive((v) => !v)} hitSlop={8}>
            <Text style={styles.link}>{showInactive ? "Hide inactive" : "Show inactive"}</Text>
          </Pressable>
        </View>

        {loading ? <Text style={styles.empty}>Loading…</Text> : shown.length === 0 ? (
          <Card><Text style={styles.empty}>No team members added yet.</Text></Card>
        ) : shown.map((m) => (
          <Pressable key={m.id} onPress={() => router.push({ pathname: "/team/[id]", params: { id: m.id } })} testID={`team-member-${m.id}`}>
            <Card style={[styles.memberCard, m.archived_at ? styles.inactiveCard : null]}>
              <View style={styles.avatar}><Icon name="account" size={24} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  {m.archived_at ? <Text style={styles.inactive}>INACTIVE</Text> : null}
                </View>
                <Text style={styles.meta}>{[m.role, m.employment_type].filter(Boolean).join(" · ") || "Team member"}</Text>
                {m.phone ? <Text style={styles.phone}>{m.phone}</Text> : null}
                <View style={styles.tags}>
                  {m.chemical_accreditation ? <Text style={styles.tag}>Chemical accredited</Text> : null}
                  {(m.machinery_competencies?.length ?? 0) > 0 ? <Text style={styles.tag}>{m.machinery_competencies!.length} machinery skills</Text> : null}
                  {m.availability ? <Text style={styles.tag}>{m.availability}</Text> : null}
                  {(openTasksByMember.get(m.id) ?? 0) > 0 ? <Text style={styles.tag}>{openTasksByMember.get(m.id)} open task{openTasksByMember.get(m.id) === 1 ? "" : "s"}</Text> : null}
                </View>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  countBadge: { backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  countText: { color: colors.onBrandSecondary, fontWeight: "800", fontSize: 11 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: spacing.lg },
  tasksCard: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: 12 },
  tasksIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  tasksTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  memberCard: { marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: 12 },
  inactiveCard: { opacity: 0.65 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  inactive: { fontSize: 9, fontWeight: "900", color: colors.muted, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2, textTransform: "capitalize" },
  phone: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 6 },
  tag: { fontSize: 10, color: colors.onBrandSecondary, backgroundColor: colors.brandSecondary, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
});
