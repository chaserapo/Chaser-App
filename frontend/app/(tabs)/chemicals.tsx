import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";

const HUB = [
  { key: "my", title: "My Chemicals", subtitle: "Browse & search your register", icon: "flask-outline", route: "/chemicals" },
  { key: "add", title: "Add Chemical", subtitle: "Manually add a product", icon: "plus-circle-outline", route: "/chemicals/new" },
  { key: "inv", title: "Chemical Inventory", subtitle: "Stock on hand · batches soon", icon: "warehouse", route: "/chemicals/inventory" },
  { key: "docs", title: "Labels & SDS", subtitle: "Open product label & SDS URLs", icon: "file-document-multiple-outline", route: "/chemicals/documents" },
];

export default function ChemicalsHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [lowStock, setLowStock] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const list = await repo.chemicals.active();
      setTotal(list.length);
      setLowStock(list.filter((c) => c.stock_qty != null && c.stock_qty <= 1).length);
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>Chemicals</Text>
        <Text style={styles.sub}>{total} product{total === 1 ? "" : "s"} · {lowStock} low stock</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {HUB.map((t) => (
          <Card key={t.key} style={{ marginBottom: spacing.md }} onPress={() => router.push(t.route as any)} testID={`chem-hub-${t.key}`}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.iconBox}>
                <Icon name={t.icon as any} size={26} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{t.title}</Text>
                <Text style={styles.itemSub}>{t.subtitle}</Text>
              </View>
              <Icon name="chevron-right" size={24} color={colors.muted} />
            </View>
          </Card>
        ))}
        <Text style={styles.footer}>
          Batch tracking, expiry alerts and auto stock deduction are on the roadmap and the data model is ready — just ask when you'd like them switched on.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  itemTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  footer: { textAlign: "center", color: colors.muted, marginTop: spacing.lg, fontSize: 12, lineHeight: 18, fontStyle: "italic" },
});
