import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, SectionList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Chip } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { exportJobsPdf } from "@/src/lib/pdf-report";
import { productCost } from "@/src/lib/calculators";
import { useAuth } from "@/src/lib/auth-context";
import type { SprayJob, Farm, Paddock } from "@/src/lib/types";

const UNASSIGNED = "__unassigned__";
const ALL_PADDOCKS = "__all__";

function monthYearKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthYearLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function SprayHistory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { business } = useAuth();
  const [jobs, setJobs] = useState<SprayJob[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [farmSel, setFarmSel] = useState<string | null>(null); // null = none picked yet, UNASSIGNED, or a farm id
  const [paddockSel, setPaddockSel] = useState<string>(ALL_PADDOCKS);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [j, f, p] = await Promise.all([repo.sprayJobs.completed(), repo.farms.list(), repo.paddocks.list()]);
      setJobs(j);
      setFarms(f);
      setPaddocks(p);
    })();
  }, []));

  function pickFarm(id: string | null) {
    setFarmSel(id);
    setPaddockSel(ALL_PADDOCKS);
  }

  const paddocksInFarm = useMemo(
    () => (farmSel && farmSel !== UNASSIGNED ? paddocks.filter((p) => p.farm_id === farmSel) : []),
    [paddocks, farmSel],
  );

  const filtered = useMemo(() => {
    if (farmSel === null) return [];
    if (farmSel === UNASSIGNED) return jobs.filter((j) => !j.farm_id || !j.paddock_id);
    return jobs.filter((j) => {
      if (j.farm_id !== farmSel) return false;
      if (paddockSel !== ALL_PADDOCKS && j.paddock_id !== paddockSel) return false;
      return true;
    });
  }, [jobs, farmSel, paddockSel]);

  const sections = useMemo(() => {
    const byMonth = new Map<string, SprayJob[]>();
    for (const j of filtered) {
      const key = monthYearKey(j.date);
      const arr = byMonth.get(key) ?? [];
      arr.push(j);
      byMonth.set(key, arr);
    }
    const keys = Array.from(byMonth.keys()).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => {
      const data = byMonth.get(k)!.sort((a, b) => (a.date < b.date ? 1 : -1));
      const costs = data.flatMap((j) => j.products.map(productCost)).filter((n): n is number => n != null);
      return {
        title: monthYearLabel(k),
        data,
        totalCost: costs.length > 0 ? costs.reduce((s, n) => s + n, 0) : undefined,
      };
    });
  }, [filtered]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader
        title="Spray History"
        back
        right={
          <Pressable
            onPress={() => { if (filtered.length > 0) exportJobsPdf(filtered, business?.name ?? "Chaser"); }}
            disabled={filtered.length === 0}
            hitSlop={8}
            testID="history-export-pdf-btn"
          >
            <Icon name="file-pdf-box" size={22} color={filtered.length > 0 ? colors.brandPrimary : colors.muted} />
          </Pressable>
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {farms.map((f) => (
          <Chip key={f.id} label={f.name} active={farmSel === f.id} onPress={() => pickFarm(f.id)} testID={`history-farm-${f.id}`} />
        ))}
        <Chip label="Unassigned" active={farmSel === UNASSIGNED} onPress={() => pickFarm(UNASSIGNED)} testID="history-farm-unassigned" />
      </ScrollView>

      {farmSel && farmSel !== UNASSIGNED && paddocksInFarm.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All paddocks" active={paddockSel === ALL_PADDOCKS} onPress={() => setPaddockSel(ALL_PADDOCKS)} testID="history-paddock-all" />
          {paddocksInFarm.map((p) => (
            <Chip key={p.id} label={p.name} active={paddockSel === p.id} onPress={() => setPaddockSel(p.id)} testID={`history-paddock-${p.id}`} />
          ))}
        </ScrollView>
      ) : null}

      {farmSel === null ? (
        <View style={styles.emptyState}>
          <Icon name="clipboard-clock-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>Pick a farm above to see its spray history, or &quot;Unassigned&quot; for jobs without a farm or paddock.</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="clipboard-text-off-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyText}>No spray records here yet.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
          renderSectionHeader={({ section }) => (
            <Text style={styles.monthHeader}>
              {section.title} · {section.data.length} job{section.data.length === 1 ? "" : "s"}
              {section.totalCost != null ? ` · $${section.totalCost.toFixed(2)}` : ""}
            </Text>
          )}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.sm }} onPress={() => router.push({ pathname: "/records/[id]", params: { id: item.id } })} testID={`history-record-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recTitle}>{item.paddock_name ?? (farmSel === UNASSIGNED ? "No paddock" : "Paddock")}</Text>
                  <Text style={styles.recSub}>{item.crop ?? "—"} · Target: {item.target ?? "—"}</Text>
                  <Text style={styles.recMeta}>{item.date} · {item.actual_area_ha ?? item.area_ha ?? 0} ha · {item.operator ?? "—"}</Text>
                  {farmSel === UNASSIGNED && item.farm_name ? <Text style={styles.recMeta}>Farm: {item.farm_name} (no paddock)</Text> : null}
                </View>
                <Icon name="chevron-right" size={22} color={colors.muted} />
              </View>
            </Card>
          )}
          stickySectionHeadersEnabled
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyText: { color: colors.muted, textAlign: "center", fontSize: 14, lineHeight: 20 },
  monthHeader: {
    fontSize: 13, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5,
    backgroundColor: colors.surface, paddingVertical: spacing.sm,
  },
  recTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  recSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  recMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
