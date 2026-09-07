import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, Chip } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { SprayJob, Farm, Paddock } from "@/src/lib/types";

export default function Records() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [jobs, setJobs] = useState<SprayJob[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [farmFilter, setFarmFilter] = useState<string | null>(null);
  const [chemQuery, setChemQuery] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [j, f, p] = await Promise.all([repo.sprayJobs.list(), repo.farms.list(), repo.paddocks.list()]);
      setJobs(j.sort((a, b) => (a.date < b.date ? 1 : -1)));
      setFarms(f);
      setPaddocks(p);
    })();
  }, []));

  const chemOptions = useMemo(() => {
    const set = new Set<string>();
    jobs.forEach((j) => j.products.forEach((p) => set.add(p.chemical_name)));
    return Array.from(set);
  }, [jobs]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (farmFilter && j.farm_id !== farmFilter) return false;
      if (chemQuery && !j.products.some((p) => p.chemical_name === chemQuery)) return false;
      return true;
    });
  }, [jobs, farmFilter, chemQuery]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Spray Records</Text>
          <Text style={styles.sub}>{filtered.length} record{filtered.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable onPress={() => router.push("/records/new")} style={styles.newBtn} testID="new-record-btn">
          <Icon name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All Farms" active={farmFilter === null} onPress={() => setFarmFilter(null)} testID="filter-farm-all" />
          {farms.map((f) => (
            <Chip key={f.id} label={f.name} active={farmFilter === f.id} onPress={() => setFarmFilter(f.id)} testID={`filter-farm-${f.id}`} />
          ))}
        </ScrollView>
        {chemOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="All Chemicals" active={chemQuery === null} onPress={() => setChemQuery(null)} testID="filter-chem-all" />
            {chemOptions.map((c) => (
              <Chip key={c} label={c} active={chemQuery === c} onPress={() => setChemQuery(c)} testID={`filter-chem-${c}`} />
            ))}
          </ScrollView>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No spray records match your filter.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Log Your First Record" icon="plus" onPress={() => router.push("/records/new")} testID="empty-log-btn" />
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/records/[id]", params: { id: item.id } })} testID={`record-card-${item.id}`}>
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.recTitle}>{item.paddock_name ?? "Paddock"}</Text>
                <Text style={styles.recSub}>{item.crop ?? "-"} · Target: {item.target ?? "-"}</Text>
                <View style={{ height: 8 }} />
                <Text style={styles.recMeta}>{item.date} · {item.area_ha ?? 0} ha · {item.operator ?? "—"}</Text>
                <Text style={styles.recChems}>{item.products.map((p) => `${p.chemical_name} ${p.rate}${p.unit}`).join("  •  ") || "No chemicals recorded"}</Text>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", marginLeft: 6 },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
  recTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  recSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  recMeta: { fontSize: 12, color: colors.muted },
  recChems: { fontSize: 13, color: colors.onSurface, marginTop: 6, fontWeight: "600" },
});
