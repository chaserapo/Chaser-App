import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { SprayJob } from "@/src/lib/types";

const TOOLS = [
  { key: "records", title: "Spray Records / History", subtitle: "Search & review completed jobs", icon: "clipboard-text-outline", route: "/records" },
  { key: "spray-rate", title: "Spray Calculator", subtitle: "Rate, coverage & flow", icon: "calculator", route: "/calculators/spray-rate" },
  { key: "tank-mix", title: "Tank Mix Calculator", subtitle: "Multi-product tank mix", icon: "beaker-outline", route: "/calculators/tank-mix" },
  { key: "nozzle", title: "Nozzle Calculator", subtitle: "ISO flat-fan size suggestion", icon: "sprinkler-variant", route: "/calculators/nozzle-guide" },
  { key: "delta-t", title: "Delta T", subtitle: "Wet-bulb depression", icon: "chart-bell-curve-cumulative", route: "/calculators/delta-t" },
];

export default function SprayHub() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<SprayJob | null>(null);
  const [completedCount, setCompletedCount] = useState(0);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [act, done] = await Promise.all([repo.sprayJobs.active(), repo.sprayJobs.completed()]);
      setActive(act);
      setCompletedCount(done.length);
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={styles.title}>Spray</Text>
        <Text style={styles.sub}>Start a job, review history or open a calculator</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {active ? (
          <Button title="Resume Active Spray Job" icon="play-circle" size="lg" onPress={() => router.push({ pathname: "/active-job/[id]", params: { id: active.id } })} testID="spray-resume-btn" />
        ) : (
          <Button title="Start Spray Job" icon="play-circle-outline" size="lg" onPress={() => router.push("/records/new")} testID="spray-start-btn" />
        )}

        <Text style={styles.sectionTitle}>Records & Tools</Text>
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
              {t.key === "records" && completedCount > 0 ? (
                <View style={styles.countBadge}><Text style={styles.countText}>{completedCount}</Text></View>
              ) : null}
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
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: spacing.xl, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  itemTitle: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  countBadge: { backgroundColor: colors.brandPrimary, minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 8 },
  countText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 12 },
});
