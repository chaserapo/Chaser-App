import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { colors, radius, spacing } from "@/src/theme";

const JOB_TYPES = [
  { key: "spray", label: "SPRAY", icon: "spray", enabled: true },
  { key: "spread", label: "SPREAD", icon: "grain", enabled: false },
  { key: "seed", label: "SEED", icon: "seed-outline", enabled: false },
  { key: "harvest", label: "HARVEST", icon: "barley", enabled: false },
  { key: "maintenance", label: "MAINTENANCE / REPAIR", icon: "wrench-outline", enabled: false },
  { key: "transport", label: "TRANSPORT", icon: "truck-outline", enabled: false },
  { key: "other", label: "OTHER", icon: "dots-horizontal-circle-outline", enabled: false },
] as const;

export default function StartJobScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  function choose(type: typeof JOB_TYPES[number]) {
    if (type.key === "spray") {
      router.push("/records/new");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Start Job" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Text style={styles.title}>What job are you starting?</Text>
        <Text style={styles.sub}>Choose the job type to open the right workflow.</Text>

        <View style={styles.grid}>
          {JOB_TYPES.map((type) => (
            <Pressable
              key={type.key}
              onPress={() => choose(type)}
              disabled={!type.enabled}
              style={({ pressed }) => [styles.tile, !type.enabled && styles.tileDisabled, pressed && type.enabled && styles.tilePressed]}
              testID={`job-type-${type.key}`}
            >
              <View style={[styles.iconWrap, !type.enabled && styles.iconWrapDisabled]}>
                <Icon name={type.icon as any} size={32} color={type.enabled ? colors.brandPrimary : colors.muted} />
              </View>
              <Text style={[styles.label, !type.enabled && styles.labelDisabled]}>{type.label}</Text>
              {!type.enabled ? <Text style={styles.comingSoon}>COMING SOON</Text> : <Text style={styles.ready}>START NOW</Text>}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  tile: {
    width: "48%",
    minHeight: 150,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  tileDisabled: { opacity: 0.6 },
  tilePressed: { opacity: 0.75 },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  iconWrapDisabled: { backgroundColor: colors.surfaceTertiary },
  label: { textAlign: "center", color: colors.onSurface, fontWeight: "900", fontSize: 15 },
  labelDisabled: { color: colors.onSurfaceTertiary },
  ready: { marginTop: 6, fontSize: 10, fontWeight: "900", color: colors.brandPrimary, letterSpacing: 0.5 },
  comingSoon: { marginTop: 6, fontSize: 9, fontWeight: "800", color: colors.muted, letterSpacing: 0.4 },
});
