import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { useRealtime } from "@/src/lib/realtime";
import type { SprayJob } from "@/src/lib/types";

function dayLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (dateStr === today) return "Today";
  if (dateStr === tomorrow) return "Tomorrow";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

const TOOLS = [
  { key: "records", title: "All Spray Records", subtitle: "Search & filter history", icon: "clipboard-text-outline", route: "/records" },
  { key: "spray-rate", title: "Spray Tools", subtitle: "Rate, coverage, nozzle & pressure", icon: "calculator", route: "/calculators/spray-rate" },
  { key: "tank-mix", title: "Tank Mix Calculator", subtitle: "Multi-product tank mix", icon: "beaker-outline", route: "/calculators/tank-mix" },
  { key: "nozzle", title: "Nozzle Guide", subtitle: "ISO flat-fan sizing", icon: "sprinkler-variant", route: "/calculators/nozzle-guide" },
  { key: "delta-t", title: "Delta T", subtitle: "Wet-bulb depression", icon: "chart-bell-curve-cumulative", route: "/calculators/delta-t" },
];

export default function SprayHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<SprayJob | null>(null);
  const [planned, setPlanned] = useState<SprayJob[]>([]);
  const [completed, setCompleted] = useState<SprayJob[]>([]);

  const load = useCallback(async () => {
    const [act, plannedList, done] = await Promise.all([
      repo.sprayJobs.active(),
      repo.sprayJobs.planned(),
      repo.sprayJobs.completed(),
    ]);
    setActive(act);
    setPlanned(plannedList.sort((a, b) => a.date.localeCompare(b.date)));
    setCompleted(done.slice(0, 5));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(["spray_jobs", "spray_job_products"], load, [load]);

  const plannedByDay = useMemo(() => {
    const byDay = new Map<string, SprayJob[]>();
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
          <Text style={styles.title}>Spray</Text>
          <Text style={styles.sub}>{planned.length} planned · {active ? 1 : 0} in progress · {completed.length} recent</Text>
        </View>
        <Pressable style={styles.newBtn} onPress={() => router.push("/records/new")} testID="new-job-btn">
          <Icon name="plus" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>New Job</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>

        {/* IN PROGRESS */}
        {active ? (
          <>
            <Text style={styles.sectionTitle}>In Progress</Text>
            <Card testID="active-job-card" style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
              <View style={styles.rowTop}>
                <View style={[styles.rowIcon, { backgroundColor: "#FEF3C7" }]}><Icon name="progress-clock" size={22} color={colors.warning} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{active.paddock_name ?? active.farm_name ?? "Spray job"}</Text>
                  <Text style={styles.rowSub}>{active.crop ?? "—"} · {active.actual_area_ha ?? active.area_ha ?? "—"} ha · {active.operator ?? "—"}</Text>
                  <Text style={styles.rowMeta}>Started {active.start_time ?? "—"}</Text>
                </View>
                <StatusBadge status="due_soon" testID="active-status" />
              </View>
              <View style={{ height: spacing.md }} />
              <Button title="COMPLETE JOB" icon="check-decagram" size="lg" onPress={() => router.push({ pathname: "/active-job/[id]", params: { id: active.id } })} testID="active-complete-btn" />
            </Card>
          </>
        ) : null}

        {/* PLANNED */}
        <Text style={styles.sectionTitle}>Planned</Text>
        {planned.length === 0 ? (
          <Card><Text style={styles.empty}>No planned jobs. Tap New Job to plan or start one.</Text></Card>
        ) : (
          plannedByDay.map((group) => (
            <View key={group.date}>
              <Text style={styles.dayHeader}>{dayLabel(group.date)}</Text>
              {group.jobs.map((j) => (
                <Card key={j.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/records/new", params: { plannedId: j.id } })} testID={`planned-${j.id}`}>
                  <View style={styles.rowTop}>
                    <View style={[styles.rowIcon, { backgroundColor: "#DBEAFE" }]}><Icon name="calendar-clock" size={20} color="#1E40AF" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{j.paddock_name ?? j.farm_name ?? "Spray job"}</Text>
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

        {/* COMPLETED */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Recently Completed</Text>
          <Pressable onPress={() => router.push("/records")} testID="see-all-completed-btn">
            <Text style={styles.link}>See all →</Text>
          </Pressable>
        </View>
        {completed.length === 0 ? (
          <Card><Text style={styles.empty}>No completed spray jobs yet.</Text></Card>
        ) : (
          completed.map((j) => (
            <Card key={j.id} style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/records/[id]", params: { id: j.id } })} testID={`completed-${j.id}`}>
              <View style={styles.rowTop}>
                <View style={styles.rowIcon}><Icon name="check-decagram" size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{j.paddock_name ?? j.farm_name ?? "Spray job"}</Text>
                  <Text style={styles.rowSub}>{j.date} · {j.actual_area_ha ?? j.area_ha ?? "—"} ha · {j.target ?? "—"}</Text>
                  <Text style={styles.rowMeta}>{j.operator ?? "—"} · {j.machinery_name ?? "—"}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </View>
            </Card>
          ))
        )}

        {/* TOOLS */}
        <Text style={styles.sectionTitle}>Tools</Text>
        {TOOLS.map((t) => (
          <Card key={t.key} style={{ marginBottom: spacing.sm, padding: 12 }} onPress={() => router.push(t.route as any)} testID={`tool-${t.key}`}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.toolIcon}><Icon name={t.icon as any} size={22} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>{t.title}</Text>
                <Text style={styles.toolSub}>{t.subtitle}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </View>
          </Card>
        ))}
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
  toolIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  toolTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  toolSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", fontSize: 13 },
});
