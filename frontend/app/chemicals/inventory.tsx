import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical } from "@/src/lib/types";

export default function Inventory() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Chemical[]>([]);
  const [q, setQ] = useState("");

  useFocusEffect(useCallback(() => { repo.chemicals.active().then((l) => setItems(l.sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0)))); }, []));

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((c) => c.product_name.toLowerCase().includes(s) || (c.storage_location ?? "").toLowerCase().includes(s));
  }, [items, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Chemical Inventory" back />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <View style={styles.search}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search product or location" placeholderTextColor={colors.muted} style={styles.searchInput} testID="inv-search" />
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<Card><Text style={styles.empty}>No stock recorded.</Text></Card>}
        ListHeaderComponent={
          <Text style={styles.hint}>Batch tracking with lot numbers, purchase & expiry dates is on the roadmap. The data model is already prepared.</Text>
        }
        renderItem={({ item }) => {
          const stock = item.stock_qty ?? 0;
          const low = stock <= 1;
          return (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: item.id } })} testID={`inv-row-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[styles.stockBox, { backgroundColor: low ? "#FEE2E2" : colors.brandSecondary }]}>
                  <Text style={[styles.stockNum, { color: low ? colors.error : colors.onBrandSecondary }]}>{stock}</Text>
                  <Text style={[styles.stockUnit, { color: low ? colors.error : colors.onBrandSecondary }]} numberOfLines={1}>{item.stock_unit ?? item.pack_size ?? ""}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.product_name}</Text>
                  {item.product_type ? <Text style={styles.type}>{item.product_type}</Text> : null}
                  {item.storage_location ? <Text style={styles.loc}>📍 {item.storage_location}</Text> : null}
                </View>
                {low ? <View style={styles.lowBadge}><Text style={styles.lowText}>LOW</Text></View> : null}
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
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 17 },
  stockBox: { width: 60, height: 60, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 14, paddingHorizontal: 4 },
  stockNum: { fontSize: 22, fontWeight: "900" },
  stockUnit: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginTop: 1 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  type: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  loc: { fontSize: 12, color: colors.muted, marginTop: 3 },
  lowBadge: { backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  lowText: { color: colors.onError, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  empty: { color: colors.muted, textAlign: "center" },
});
