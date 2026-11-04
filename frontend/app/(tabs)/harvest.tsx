import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useRealtime } from "@/src/lib/realtime";
import type { HarvestJob } from "@/src/lib/types";

function dayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

export default function HarvestHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<HarvestJob | null>(null);
  const [planned, setPlanned] = useState<HarvestJob[]>([]);
  const [completed, setCompleted] = useState<HarvestJob[]>([]);

  const load = useCallback(async () => {
    const [act, plannedList, done] = await Promise.all([
      repo.harvestJobs.active(),
      repo.harvestJobs.planned(),
      repo.harvestJobs.completed(),
    ]);
    setActive(act);
    setPlanned(plannedList.sort((a, b) => a.date.localeCompare(b.date)));
    setCompleted(done.slice(0, 5));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(["harvest_jobs"], load, [load]);

  const plannedByDay = useMemo(() => {
    const byDay = new Map<string, HarvestJob[]>();
    for (const j of planned) {
      const arr = byDay.get(j.date) ?? [];
      arr.push(j);
      byDay.set(j.date, arr);
    }
    return Array.from(byDay.keys()).sort().map((date) => ({ date, jobs: byDay.get(date)! }));
  }, [planned]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Harvest</Text>
          <Text style={styles.sub}>{planned.length} planned · {active ? 1 : 0} in progress · {completed.length} recent</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => router.push("/harvest-records/new")} testID="new-harvest-job-btn">
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>New Job</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>

        {active ? (
          <>
            <Text style={styles.sectionTitle}>In Progress</Text>
            <Card testID="active-harvest-job-card" style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
              <View style={styles.rowTop}>
                <View style={[styles.rowIcon, { backgroundColor: "#FEF3C7" }]}><Icon name="progress-clock" size={22} color={colors.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{active.paddock_name ?? active.farm_name ?? "Harvest job"}</Text>
                  <Text style={styles.rowSub}>{active.crop ?? "—"} · {active.actual_area_ha ?? active.area_ha ?? "—"} ha · {active.operator ?? "—"}</Text>
                  <Text style={styles.rowMeta}>Started {active.start_time ?? "—"}</Text>
                </View>
                <StatusBadge status="due_soon" testID="active-harvest-status" />
              </View>
              <View style={{ height: spacing.md }} />
              <Button title="COMPLETE JOB" icon="check-decagram" size="lg" onPress={() => router.push({ pathname: "/active-harvest-job/[id]", params: { id: active.id } })} testID="active-complete-btn" />
            </Card>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>Planned</Text>
        {planned.length === 0 ? (
          <Card><Text style={styles.empty}>No planned jobs. Tap New Job to plan or start one.</Text></Card>
        ) : (
          plannedByDay.map((group) => (
            <View key={group.date}>
              <Text style={styles.dayHeader}>{dayLabel(group.date)}</Text>
              {group.jobs.map((j) => (
                <Card key={j.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/harvest-records/new", params: { plannedId: j.id } })} testID={`planned-${j.id}`}>
                  <View style={styles.rowTop}>
                    <View style={[styles.rowIcon, { backgroundColor: "#DBEAFE" }]}><Icon name="calendar-clock" size={20} color="#1E40AF" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{j.paddock_name ?? j.farm_name ?? "Harvest job"}</Text>
                      <Text style={styles.rowSub}>{j.crop ?? "—"} · {j.area_ha ?? "—"} ha</Text>
                      <Text style={styles.rowMeta}>{j.operator ?? "Not assigned"} · {j.machinery_name ?? "No machine"}</Text>
                    </View>
                    <View style={styles.plannedBadge}><Text style={styles.plannedBadgeText}>PLANNED</Text></View>
                  </View>
                </Card>
              ))}
            </View>
          ))
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recently Completed</Text>
          <Pressable onPress={() => router.push("/harvest-records")} testID="see-all-completed-btn">
            <Text style={styles.link}>See all →</Text>
          </Pressable>
        </View>
        {completed.length === 0 ? (
          <Card><Text style={styles.empty}>No completed harvest jobs yet.</Text></Card>
        ) : (
          completed.map((j) => (
            <Card key={j.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/harvest-records/[id]", params: { id: j.id } })} testID={`completed-${j.id}`}>
              <View style={styles.rowTop}>
                <View style={styles.rowIcon}><Icon name="check-decagram" size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{j.paddock_name ?? j.farm_name ?? "Harvest job"}</Text>
                  <Text style={styles.rowSub}>{j.date} · {j.actual_area_ha ?? j.area_ha ?? "—"} ha · {j.yield_value != null ? `${j.yield_value} ${j.yield_unit === "bu_ac" ? "bu/ac" : "t/ha"}` : "—"}</Text>
                  <Text style={styles.rowMeta}>{j.operator ?? "—"} · {j.machinery_name ?? "—"}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  dayHeader: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.xs, marginTop: 2 },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  rowTop: { flexDirection: "row", alignItems: "center" },
  rowIcon: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  rowMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  plannedBadge: { backgroundColor: "#DBEAFE", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  plannedBadgeText: { color: "#1E40AF", fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  empty: { color: colors.muted, textAlign: "center", fontSize: 13 },
});
