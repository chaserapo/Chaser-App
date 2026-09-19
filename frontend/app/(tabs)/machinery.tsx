import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import { useRealtime } from "@/src/lib/realtime";
import type { Machinery, MaintenanceStatus, IssueSeverity } from "@/src/lib/types";

type EnrichedMachine = Machinery & {
  status: MaintenanceStatus;
  nextService?: number;
  dueCount: number;
  overdueCount: number;
  totalMaint: number;
  openFaults: number;
  topFaultSeverity: IssueSeverity | null;
};

const OPEN_ISSUE_STATUSES = ["open", "assigned", "in_progress"];
const SEVERITY_RANK: Record<IssueSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export default function MachineryTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<EnrichedMachine[]>([]);

  const load = useCallback(async () => {
    const [m, ms, issues] = await Promise.all([repo.machinery.list(), repo.maintenance.list(), repo.farmIssues.list()]);
    const enriched: EnrichedMachine[] = m
      .filter((x) => !x.archived_at)
      .map((x) => {
        const machMaints = ms.filter((mm) => mm.machinery_id === x.id);
        const openIssues = issues.filter((i) => i.machinery_id === x.id && OPEN_ISSUE_STATUSES.includes(i.status));
        const openFaults = openIssues.length;
        const topFaultSeverity = openIssues.reduce<IssueSeverity | null>((top, i) => {
          if (!top || SEVERITY_RANK[i.severity] > SEVERITY_RANK[top]) return i.severity;
          return top;
        }, null);
        let next: number | undefined;
        let dueCount = 0;
        let overdueCount = 0;
        machMaints.forEach((mn) => {
          if (mn.next_service_hours != null) {
            if (next == null || mn.next_service_hours < next) next = mn.next_service_hours;
          }
          const status = maintenanceStatus(x.current_hours, mn.next_service_hours);
          if (status === "due_soon") dueCount += 1;
          if (status === "overdue") overdueCount += 1;
        });
        const overallStatus: MaintenanceStatus = overdueCount > 0 ? "overdue" : dueCount > 0 ? "due_soon" : "good";
        return { ...x, status: overallStatus, nextService: next, dueCount, overdueCount, totalMaint: machMaints.length, openFaults, topFaultSeverity };
      });
    enriched.sort((a, b) => {
      if ((a.openFaults > 0) !== (b.openFaults > 0)) return a.openFaults > 0 ? -1 : 1;
      if (a.openFaults > 0 && b.openFaults > 0) {
        const aRank = a.topFaultSeverity ? SEVERITY_RANK[a.topFaultSeverity] : -1;
        const bRank = b.topFaultSeverity ? SEVERITY_RANK[b.topFaultSeverity] : -1;
        if (aRank !== bRank) return bRank - aRank;
      }
      const rank = { overdue: 0, due_soon: 1, good: 2 } as const;
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.name.localeCompare(b.name);
    });
    setList(enriched);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useRealtime(["machinery", "maintenance_schedules", "maintenance_completions", "farm_issues"], load, [load]);

  const totalMachines = list.length;
  const totalDueSoon = list.reduce((s, m) => s + m.dueCount, 0);
  const totalOverdue = list.reduce((s, m) => s + m.overdueCount, 0);
  const totalOpenFaults = list.reduce((s, m) => s + m.openFaults, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Machinery</Text>
          <Text style={styles.sub}>{totalMachines} machine{totalMachines === 1 ? "" : "s"} in your fleet</Text>
        </View>
        <Pressable onPress={() => router.push("/machinery/new")} style={styles.newBtn} testID="new-machinery-btn">
          <Icon name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListHeaderComponent={
          totalMachines > 0 ? (
            <View style={styles.statsRow} testID="machinery-stats">
              <StatTile label="Machines" value={totalMachines} tone="brand" icon="tractor-variant" testID="stat-total" />
              <StatTile label="Due Soon" value={totalDueSoon} tone={totalDueSoon > 0 ? "warn" : "muted"} icon="clock-alert-outline" testID="stat-due" />
              <StatTile label="Overdue" value={totalOverdue} tone={totalOverdue > 0 ? "danger" : "muted"} icon="alert-octagon-outline" testID="stat-overdue" />
              <StatTile label="Faults" value={totalOpenFaults} tone={totalOpenFaults > 0 ? "danger" : "muted"} icon="alert-circle-outline" testID="stat-faults" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No machinery yet.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Add Your First Machine" icon="plus" onPress={() => router.push("/machinery/new")} testID="empty-add-machine-btn" />
          </Card>
        }
        renderItem={({ item }) => {
          const remaining = item.nextService != null && item.current_hours != null ? item.nextService - item.current_hours : null;
          return (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/machinery/[id]", params: { id: item.id } })} testID={`machine-card-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.iconBox}>
                  <Icon name={iconForType(item.machine_type)} size={26} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.name}>{item.name}</Text>
                    {item.machine_type ? (
                      <View style={styles.typePill}>
                        <Text style={styles.typePillText}>{item.machine_type}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>{[item.make, item.model].filter(Boolean).join(" ") || "—"}</Text>
                  <View style={styles.metricsRow}>
                    {item.current_hours != null ? (
                      <View style={styles.metric}>
                        <Icon name="clock-outline" size={12} color={colors.muted} />
                        <Text style={styles.metricText}>{item.current_hours}h</Text>
                      </View>
                    ) : null}
                    {item.current_km != null ? (
                      <View style={styles.metric}>
                        <Icon name="road-variant" size={12} color={colors.muted} />
                        <Text style={styles.metricText}>{item.current_km}km</Text>
                      </View>
                    ) : null}
                    {item.nextService != null ? (
                      <View style={styles.metric}>
                        <Icon name="wrench-outline" size={12} color={colors.muted} />
                        <Text style={[styles.metricText, remaining != null && remaining <= 0 && { color: colors.error, fontWeight: "700" }]}>
                          {remaining != null && remaining <= 0
                            ? `${Math.abs(Math.round(remaining))}h overdue`
                            : `next @ ${item.nextService}h`}
                        </Text>
                      </View>
                    ) : item.totalMaint === 0 ? (
                      <View style={styles.metric}>
                        <Icon name="wrench-outline" size={12} color={colors.muted} />
                        <Text style={styles.metricText}>no schedule</Text>
                      </View>
                    ) : null}
                    {item.openFaults > 0 ? (
                      <View style={styles.metric}>
                        <Icon name={faultSeverityIcon(item.topFaultSeverity) as any} size={12} color={faultSeverityColor(item.topFaultSeverity)} />
                        <Text style={[styles.metricText, { color: faultSeverityColor(item.topFaultSeverity), fontWeight: "700" }]}>
                          {item.topFaultSeverity === "critical" ? "CRITICAL · " : ""}
                          {item.openFaults} open fault{item.openFaults === 1 ? "" : "s"}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <StatusBadge status={item.status} testID={`machine-status-${item.id}`} />
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

function iconForType(t?: string): string {
  switch (t) {
    case "Self-propelled sprayer":
    case "Tow-behind sprayer":
      return "sprinkler-variant";
    case "Header/Harvester":
      return "combine-harvester";
    case "Air seeder":
    case "Spreader":
      return "grain";
    case "Ute/Vehicle":
      return "car-pickup";
    case "Implement":
      return "hammer-wrench";
    default:
      return "tractor-variant";
  }
}

function faultSeverityColor(severity: IssueSeverity | null): string {
  switch (severity) {
    case "critical": return "#DC2626";
    case "high": return "#EA580C";
    case "medium": return colors.warning;
    default: return colors.error;
  }
}

function faultSeverityIcon(severity: IssueSeverity | null): string {
  return severity === "critical" || severity === "high" ? "alert-octagon" : "alert-circle";
}

function StatTile({ label, value, tone, icon, testID }: { label: string; value: number; tone: "brand" | "warn" | "danger" | "muted"; icon: string; testID?: string }) {
  const styleMap = {
    brand: { bg: colors.brandSecondary, fg: colors.onBrandSecondary, iconColor: colors.brandPrimary },
    warn: { bg: "#FEF3C7", fg: colors.warning, iconColor: colors.warning },
    danger: { bg: "#FEE2E2", fg: colors.error, iconColor: colors.error },
    muted: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary, iconColor: colors.muted },
  }[tone];
  return (
    <View style={[styles.tile, { backgroundColor: styleMap.bg }]} testID={testID}>
      <Icon name={icon as any} size={20} color={styleMap.iconColor} />
      <Text style={[styles.tileValue, { color: styleMap.fg }]}>{value}</Text>
      <Text style={[styles.tileLabel, { color: styleMap.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", marginLeft: 6 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  tile: { flexGrow: 1, flexBasis: "47%", paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.lg, alignItems: "flex-start" },
  tileValue: { fontSize: 22, fontWeight: "800", marginTop: 4 },
  tileLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  typePill: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typePillText: { fontSize: 9, fontWeight: "800", color: colors.onSurfaceTertiary, letterSpacing: 0.3 },
  meta: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  metric: { flexDirection: "row", alignItems: "center", gap: 3 },
  metricText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
});
