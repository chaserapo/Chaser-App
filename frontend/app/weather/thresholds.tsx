import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input, Button } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { loadThresholds, saveThresholds, DEFAULT_THRESHOLDS, type SprayThresholds } from "@/src/lib/weather-intel";

export default function ThresholdsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const [t, setT] = useState<SprayThresholds>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try { setT(await loadThresholds(farmId as string)); } finally { setLoading(false); }
  }, [farmId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!farmId) return;
    setSaving(true);
    try {
      await saveThresholds(farmId as string, t);
      router.back();
    } finally { setSaving(false); }
  }

  function upd(key: keyof SprayThresholds, raw: string) {
    const v = raw === "" ? undefined : Number(raw);
    if (v == null || isNaN(v)) return;
    setT((s) => ({ ...s, [key]: v }));
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <ScreenHeader title="Spray thresholds" back />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Spray thresholds" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <Card>
          <Text style={styles.intro}>
            Chaser uses these values to find "best spraying windows" in the consensus forecast for this farm. Adjust to match your operation. These are recommendations only and do not replace chemical-label conditions or legal spray requirements.
          </Text>
        </Card>

        <Text style={styles.section}>Wind</Text>
        <Card>
          <Input label="Minimum wind (km/h)"  value={String(t.wind_min_kmh)}  onChangeText={(v) => upd("wind_min_kmh", v)}  keyboardType="decimal-pad" testID="th-wind-min" />
          <Input label="Maximum wind (km/h)"  value={String(t.wind_max_kmh)}  onChangeText={(v) => upd("wind_max_kmh", v)}  keyboardType="decimal-pad" testID="th-wind-max" />
          <Input label="Maximum gust (km/h)"  value={String(t.gust_max_kmh)}  onChangeText={(v) => upd("gust_max_kmh", v)}  keyboardType="decimal-pad" testID="th-gust-max" />
        </Card>

        <Text style={styles.section}>Humidity</Text>
        <Card>
          <Input label="Minimum RH (%)"  value={String(t.humidity_min_pct)} onChangeText={(v) => upd("humidity_min_pct", v)} keyboardType="decimal-pad" testID="th-rh-min" />
          <Input label="Maximum RH (%)"  value={String(t.humidity_max_pct)} onChangeText={(v) => upd("humidity_max_pct", v)} keyboardType="decimal-pad" testID="th-rh-max" />
        </Card>

        <Text style={styles.section}>Temperature</Text>
        <Card>
          <Input label="Maximum temperature (°C)" value={String(t.temp_max_c)}  onChangeText={(v) => upd("temp_max_c", v)}  keyboardType="decimal-pad" testID="th-temp-max" />
          <Input label="Maximum Delta T"          value={String(t.delta_t_max)} onChangeText={(v) => upd("delta_t_max", v)} keyboardType="decimal-pad" testID="th-dt-max" />
        </Card>

        <Text style={styles.section}>Rainfall</Text>
        <Card>
          <Input label="Rain-free period after spraying (hours)" value={String(t.rain_free_hours_after)} onChangeText={(v) => upd("rain_free_hours_after", v)} keyboardType="number-pad" testID="th-rain-free" />
        </Card>

        <View style={styles.actions}>
          <Pressable onPress={() => setT(DEFAULT_THRESHOLDS)} style={styles.resetBtn} testID="th-reset">
            <Icon name="restart" size={16} color={colors.brandPrimary} />
            <Text style={styles.resetBtnText}>Reset to defaults</Text>
          </Pressable>
          <Button title="Save thresholds" onPress={save} loading={saving} testID="th-save-btn" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { color: colors.onSurface, fontSize: 13, lineHeight: 19 },
  section: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: spacing.sm },
  actions: { marginTop: spacing.xl, gap: 10 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  resetBtnText: { color: colors.brandPrimary, fontWeight: "700" },
});
