import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical } from "@/src/lib/types";

export default function ChemicalsList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Chemical[]>([]);
  const [q, setQ] = useState("");

  useFocusEffect(useCallback(() => { repo.chemicals.list().then((l) => setItems(l.sort((a, b) => a.product_name.localeCompare(b.product_name)))); }, []));

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((c) =>
      c.product_name.toLowerCase().includes(s) ||
      (c.active_ingredient ?? "").toLowerCase().includes(s) ||
      (c.apvma_number ?? "").includes(s) ||
      (c.chemical_group ?? "").toLowerCase().includes(s),
    );
  }, [items, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Chemical Register" back />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <View style={styles.search}>
          <Icon name="magnify" size={22} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by product, AI or APVMA #"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            testID="chem-search"
          />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<Card><Text style={styles.empty}>No chemicals found.</Text></Card>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: item.id } })} testID={`chemical-card-${item.id}`}>
            <View style={{ flexDirection: "row" }}>
              <View style={styles.iconBox}><Icon name="flask-outline" size={22} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.product_name}</Text>
                {item.active_ingredient ? <Text style={styles.ai}>{item.active_ingredient}</Text> : null}
                <View style={styles.metaRow}>
                  {item.apvma_number ? <Text style={styles.meta}>APVMA {item.apvma_number}</Text> : null}
                  {item.chemical_group ? <Text style={styles.meta}> · Group {item.chemical_group}</Text> : null}
                </View>
                {item.stock_qty != null ? <Text style={styles.stock}>Stock: {item.stock_qty} × {item.pack_size ?? ""}</Text> : null}
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
  search: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 48, gap: 8 },
  searchInput: { flex: 1, fontSize: 16, color: colors.onSurface },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  ai: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  metaRow: { flexDirection: "row", marginTop: 4 },
  meta: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  stock: { fontSize: 12, color: colors.brandPrimary, marginTop: 4, fontWeight: "700" },
  empty: { color: colors.muted, textAlign: "center" },
});
