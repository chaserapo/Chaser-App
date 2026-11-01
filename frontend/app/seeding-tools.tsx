import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";

const TOOLS = [
  { key: "seed-rate", title: "Seeding Rate Calculator", subtitle: "Target density, TSW, germination & establishment", icon: "seed-outline", route: "/seeding-calculators/seed-rate" },
  { key: "fertiliser-blend", title: "Starter Fertiliser Blend", subtitle: "Multi-product rate & cost per paddock", icon: "beaker-outline", route: "/seeding-calculators/fertiliser-blend" },
  { key: "seed-treatment", title: "Seed Treatment / Inoculant", subtitle: "Rate per tonne of seed", icon: "flask-outline", route: "/seeding-calculators/seed-treatment" },
];

export default function SeedingTools() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Seeding Tools" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Text style={styles.sectionTitle}>Calculators</Text>
        {TOOLS.map((t) => (
          <Card key={t.key} style={{ marginBottom: spacing.sm, padding: 12 }} onPress={() => router.push(t.route as any)} testID={`tool-${t.key}`}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.toolIcon}><Icon name={t.icon as any} size={22} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolTitle}>{t.title}</Text>
                <Text style={styles.toolSub}>{t.subtitle}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </View>
          </Card>
        ))}

        <Card style={{ marginTop: spacing.md, backgroundColor: colors.surfaceTertiary }}>
          <Text style={styles.comingSoon}>Seeding job records and a sowing-window forecast are coming next — for now these calculators work standalone, nothing is saved.</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.muted, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  toolIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  toolTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  toolSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  comingSoon: { fontSize: 12, color: colors.onSurfaceTertiary, lineHeight: 17 },
});
