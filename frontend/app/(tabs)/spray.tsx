import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

const TOOLS = [
  { key: "spray-rate", title: "Spray Rate Calculator", subtitle: "Nozzle flow, tank coverage", icon: "calculator", route: "/calculators/spray-rate" },
  { key: "tank-mix", title: "Tank Mix Calculator", subtitle: "Multi-product tank mix", icon: "beaker-outline", route: "/calculators/tank-mix" },
  { key: "delta-t", title: "Delta T Calculator", subtitle: "Wet-bulb depression", icon: "chart-bell-curve-cumulative", route: "/calculators/delta-t" },
];

export default function SprayHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>Spray Tools</Text>
        <Text style={styles.sub}>Australian units · live calculations</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {TOOLS.map((t) => (
          <Card key={t.key} style={{ marginBottom: spacing.md }} onPress={() => router.push(t.route as any)} testID={`tool-${t.key}`}>
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
});
