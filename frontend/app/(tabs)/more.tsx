import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { EXTERNAL_LINKS } from "@/src/lib/links";

const TOOLS = [
  { title: "Delta T Calculator", icon: "chart-bell-curve-cumulative", route: "/calculators/delta-t" },
  { title: "Spray Rate Calculator", icon: "calculator", route: "/calculators/spray-rate" },
  { title: "Tank Mix Calculator", icon: "beaker-outline", route: "/calculators/tank-mix" },
  { title: "Nozzle Flow Calculator", icon: "sprinkler-variant", route: "/calculators/spray-rate" },
  { title: "Farms & Paddocks", icon: "tractor", route: "/farms" },
  { title: "Machinery Maintenance", icon: "wrench-outline", route: "/(tabs)/machinery" },
  { title: "Chemical Register", icon: "flask-outline", route: "/chemicals" },
];

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const categories = ["Weather", "Chemicals & Labels", "Spray Application", "Agronomy"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.sub}>Tools & external resources</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Text style={styles.sectionTitle}>Tools</Text>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {TOOLS.map((t, i) => (
            <Pressable
              key={t.title}
              onPress={() => router.push(t.route as any)}
              testID={`tool-link-${t.title.toLowerCase().replace(/\s+/g, "-")}`}
              style={({ pressed }) => [styles.row, i < TOOLS.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
            >
              <Icon name={t.icon as any} size={22} color={colors.brandPrimary} />
              <Text style={styles.rowText}>{t.title}</Text>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </Pressable>
          ))}
        </Card>

        {categories.map((cat) => {
          const linksInCat = EXTERNAL_LINKS.filter((l) => l.category === cat);
          if (linksInCat.length === 0) return null;
          return (
            <View key={cat}>
              <Text style={styles.sectionTitle}>{cat}</Text>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                {linksInCat.map((l, i) => (
                  <Pressable
                    key={l.url}
                    onPress={() => Linking.openURL(l.url)}
                    testID={`ext-link-${l.name.replace(/\s+/g, "-")}`}
                    style={({ pressed }) => [styles.row, i < linksInCat.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
                  >
                    <Icon name="open-in-new" size={20} color={colors.brandPrimary} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.rowText, { marginLeft: 0 }]}>{l.name}</Text>
                      {l.description ? <Text style={styles.rowSub}>{l.description}</Text> : null}
                    </View>
                    <Icon name="chevron-right" size={22} color={colors.muted} />
                  </Pressable>
                ))}
              </Card>
            </View>
          );
        })}

        <Text style={styles.footer}>HectareHQ · v1.0 (Demo Mode)</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 56, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowText: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.onSurface, marginLeft: 12 },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  footer: { textAlign: "center", color: colors.muted, marginTop: spacing.xl, fontSize: 12 },
});
