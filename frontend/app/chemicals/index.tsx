import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { CHEMICAL_CATEGORIES, ChemicalCategory } from "@/src/lib/types";
import type { Chemical } from "@/src/lib/types";

const TYPE_COLORS: Record<ChemicalCategory, { bg: string; fg: string }> = {
  Herbicide: { bg: "#FEE2E2", fg: "#B91C1C" },
  Fungicide: { bg: "#DBEAFE", fg: "#1D4ED8" },
  Insecticide: { bg: "#FEF3C7", fg: "#B45309" },
  Adjuvant: { bg: "#DCFCE7", fg: "#14532D" },
  Fertiliser: { bg: "#F3E8FF", fg: "#6B21A8" },
  Other: { bg: "#E5E7EB", fg: "#374151" },
};

export default function ChemicalsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Chemical[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<ChemicalCategory | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useFocusEffect(useCallback(() => { repo.chemicals.list().then((l) => setItems(l.sort((a, b) => a.product_name.localeCompare(b.product_name)))); }, []));

  const filtered = useMemo(() => {
    let list = items;
    list = list.filter((c) => (showArchived ? !!c.archived_at : !c.archived_at));
    if (type) list = list.filter((c) => c.product_type === type);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) =>
        c.product_name.toLowerCase().includes(s) ||
        (c.active_ingredient ?? "").toLowerCase().includes(s) ||
        (c.apvma_number ?? "").includes(s) ||
        (c.chemical_group ?? "").toLowerCase().includes(s) ||
        (c.manufacturer ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  }, [items, q, type, showArchived]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Chemical Register" back right={
        <Pressable onPress={() => router.push("/chemicals/new")} testID="add-chem-header-btn">
          <Icon name="plus" size={24} color={colors.brandPrimary} />
        </Pressable>
      } />

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <View style={styles.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={colors.muted} style={styles.searchInput} testID="chem-search" />
          {q ? <Pressable onPress={() => setQ("")} testID="clear-chem-search"><Icon name="close-circle" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ flexGrow: 0, maxHeight: 56 }}>
        <Chip label="All" active={type === null} onPress={() => setType(null)} testID="filter-type-all" />
        {CHEMICAL_CATEGORIES.map((c) => (
          <Chip key={c} label={c} active={type === c} onPress={() => setType(c)} testID={`filter-type-${c}`} />
        ))}
        <Pressable
          onPress={() => setShowArchived((v) => !v)}
          style={[styles.archToggle, showArchived && styles.archToggleActive]}
          testID="toggle-archived-chems"
        >
          <Icon name={showArchived ? "archive" : "archive-outline"} size={14} color={showArchived ? colors.onBrandPrimary : colors.onSurface} />
          <Text style={[styles.archText, showArchived && { color: colors.onBrandPrimary }]}>{showArchived ? "Archived" : "Active"}</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.sectionRow}>
        <Text style={styles.myTitle}>My Chemicals</Text>
        <Text style={styles.count}>{filtered.length}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>{q || type ? "No matches." : showArchived ? "No archived chemicals." : "No chemicals yet."}</Text>
            {!q && !type && !showArchived ? (
              <>
                <View style={{ height: spacing.md }} />
                <Button title="Add Chemical" icon="plus" onPress={() => router.push("/chemicals/new")} testID="empty-add-chem-btn" />
              </>
            ) : null}
          </Card>
        }
        renderItem={({ item }) => {
          const tc = TYPE_COLORS[item.product_type ?? "Other"];
          return (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: item.id } })} testID={`chemical-card-${item.id}`}>
              <View style={{ flexDirection: "row" }}>
                <View style={styles.iconBox}><Icon name="flask-outline" size={22} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.name}>{item.product_name}</Text>
                    {item.product_type ? (
                      <View style={[styles.typeBadge, { backgroundColor: tc.bg }]}><Text style={[styles.typeBadgeText, { color: tc.fg }]}>{item.product_type}</Text></View>
                    ) : null}
                    {item.archived_at ? <View style={styles.archBadge}><Text style={styles.archBadgeText}>Archived</Text></View> : null}
                  </View>
                  {item.active_ingredient ? <Text style={styles.ai}>{item.active_ingredient}</Text> : null}
                  <View style={styles.metaRow}>
                    {item.apvma_number ? <Text style={styles.meta}>APVMA {item.apvma_number}</Text> : null}
                    {item.chemical_group ? <Text style={styles.meta}> · Group {item.chemical_group}</Text> : null}
                  </View>
                  {item.stock_qty != null ? <Text style={styles.stock}>Stock: {item.stock_qty} {item.stock_unit ?? item.pack_size ?? ""}</Text> : null}
                </View>
                <Icon name="chevron-right" size={22} color={colors.muted} />
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  chipRow: { gap: 8, paddingHorizontal: spacing.lg, alignItems: "center", height: 56 },
  archToggle: { flexDirection: "row", alignItems: "center", gap: 4, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  archToggleActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  archText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  myTitle: { fontSize: 14, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  count: { fontSize: 13, fontWeight: "700", color: colors.muted },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  typeBadgeText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  archBadge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  archBadgeText: { fontSize: 10, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  ai: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  metaRow: { flexDirection: "row", marginTop: 4 },
  meta: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  stock: { fontSize: 12, color: colors.brandPrimary, marginTop: 4, fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center" },
});
