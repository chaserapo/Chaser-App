import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical } from "@/src/lib/types";

export default function LowStock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Chemical[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const list = await repo.chemicals.active();
      setItems(list.filter((c) => c.stock_qty != null && c.stock_qty <= 1).sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0)));
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Low Stock" back />
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<Card><Text style={styles.empty}>Nothing running low. 👍</Text></Card>}
        ListHeaderComponent={<Text style={styles.hint}>Products with stock ≤ 1 {"unit(s)"} are shown here so you can reorder.</Text>}
        renderItem={({ item }) => {
          const stock = item.stock_qty ?? 0;
          const critical = stock <= 0;
          return (
            <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/chemicals/[id]", params: { id: item.id } })} testID={`low-row-${item.id}`}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={[styles.box, { backgroundColor: critical ? colors.error : "#FEE2E2" }]}>
                  <Text style={[styles.num, { color: critical ? colors.onError : colors.error }]}>{stock}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.product_name}</Text>
                  {item.product_type ? <Text style={styles.type}>{item.product_type}{item.manufacturer ? ` · ${item.manufacturer}` : ""}</Text> : null}
                  <Text style={styles.unit}>{item.stock_unit ?? item.pack_size ?? "packs"}</Text>
                </View>
                <Pressable onPress={(e) => { e.stopPropagation?.(); router.push({ pathname: "/chemicals/stock-adjust", params: { chemicalId: item.id } }); }} style={styles.adjustBtn} testID={`quick-adjust-${item.id}`}>
                  <Icon name="plus" size={18} color={colors.onBrandPrimary} />
                </Pressable>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 17 },
  box: { width: 56, height: 56, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 14 },
  num: { fontSize: 24, fontWeight: "900" },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  type: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  unit: { fontSize: 12, color: colors.muted, marginTop: 2 },
  adjustBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center" },
});
