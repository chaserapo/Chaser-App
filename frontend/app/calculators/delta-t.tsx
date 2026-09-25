import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { deltaT, fmt } from "@/src/lib/calculators";
import { fetchWeather } from "@/src/lib/weather";

export default function DeltaTCalc() {
  const insets = useSafeAreaInsets();
  const [temp, setTemp] = useState("20");
  const [rh, setRh] = useState("55");
  const [wind, setWind] = useState("");
  const [dir, setDir] = useState("");
  const [loading, setLoading] = useState(false);

  const dt = useMemo(() => deltaT(parseFloat(temp) || 0, parseFloat(rh) || 0), [temp, rh]);

  async function useLive() {
    setLoading(true);
    try {
      const w = await fetchWeather();
      setTemp(w.temperature_c.toFixed(1));
      setRh(w.humidity.toFixed(0));
      setWind(w.wind_speed.toFixed(0));
      setDir(w.wind_direction);
    } finally { setLoading(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Delta T Calculator" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Button title="Use live weather" icon="satellite-variant" variant="outline" onPress={useLive} loading={loading} testID="use-live-weather-btn" />
          <View style={{ height: spacing.md }} />
          <Card>
            <Input label="Temperature" value={temp} onChangeText={setTemp} keyboardType="decimal-pad" suffix="°C" testID="input-temp" />
            <Input label="Relative humidity" value={rh} onChangeText={setRh} keyboardType="decimal-pad" suffix="%" testID="input-rh" />
            <Input label="Wind speed (optional)" value={wind} onChangeText={setWind} keyboardType="decimal-pad" suffix="km/h" testID="input-wind" />
            <Input label="Wind direction (optional)" value={dir} onChangeText={setDir} testID="input-dir" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary, alignItems: "center", padding: spacing.xl }}>
            <Text style={styles.resultLabel}>Delta T</Text>
            <Text style={styles.resultValue} testID="delta-t-result">{fmt(dt, 1)}</Text>
            <Text style={styles.resultUnit}>°C wet-bulb depression</Text>
          </Card>

          <View style={{ height: spacing.md }} />
          <Card>
            <Text style={styles.disclaimerTitle}>Important</Text>
            <Text style={styles.disclaimerBody}>
              Check current product label, weather conditions and local spraying requirements before application.
            </Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  resultLabel: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 1 },
  resultValue: { fontSize: 64, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 4 },
  resultUnit: { fontSize: 12, color: colors.onBrandSecondary, fontWeight: "600" },
  disclaimerTitle: { fontSize: 13, fontWeight: "800", color: colors.warning, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  disclaimerBody: { fontSize: 14, lineHeight: 20, color: colors.onSurface },
});
