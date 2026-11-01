import { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Chip } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { SeedingJob, Farm } from "@/src/lib/types";

export default function SeedingRecords() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [jobs, setJobs] = useState<SeedingJob[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [farmFilter, setFarmFilter] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [j, f] = await Promise.all([repo.seedingJobs.completed(), repo.farms.list()]);
      setJobs(j.sort((a, b) => (a.date < b.date ? 1 : -1)));
      setFarms(f);
    })();
  }, []));

  const filtered = useMemo(() => jobs.filter((j) => !farmFilter || j.farm_id === farmFilter), [jobs, farmFilter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} testID="seeding-records-back-btn" hitSlop={8}>
          <Icon name="chevron-left" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Seeding Records</Text>
          <Text style={styles.sub}>{filtered.length} record{filtered.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable onPress={() => router.push("/seeding-records/new")} style={styles.newBtn} testID="new-seeding-record-btn">
          <Icon name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="All Farms" active={farmFilter === null} onPress={() => setFarmFilter(null)} testID="filter-farm-all" />
        {farms.map((f) => (
          <Chip key={f.id} label={f.name} active={farmFilter === f.id} onPress={() => setFarmFilter(f.id)} testID={`filter-farm-${f.id}`} />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No seeding records match your filter.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Log Your First Record" icon="plus" onPress={() => router.push("/seeding-records/new")} testID="empty-log-btn" />
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/seeding-records/[id]", params: { id: item.id } })} testID={`seeding-record-card-${item.id}`}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recTitle}>{item.paddock_name ?? "Paddock"}</Text>
                <Text style={styles.recSub}>{item.crop ?? "—"} · {item.seed_rate_kg_ha != null ? `${item.seed_rate_kg_ha.toFixed(1)} kg/ha` : "—"}</Text>
                <View style={{ height: 8 }} />
                <Text style={styles.recMeta}>{item.date} · {item.actual_area_ha ?? item.area_ha ?? 0} ha · {item.operator ?? "—"}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: -4 },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", marginLeft: 6 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
  recTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  recSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  recMeta: { fontSize: 12, color: colors.muted },
});
