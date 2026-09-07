import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { nozzleFlowLpm, fmt } from "@/src/lib/calculators";

// ISO 110° flat-fan reference flow rates at 3 bar (L/min).
const ISO_NOZZLES = [
  { code: "015", colour: "Green", swatch: "#4ADE80", flow_3bar: 0.59 },
  { code: "02",  colour: "Yellow", swatch: "#FDE047", flow_3bar: 0.79 },
  { code: "025", colour: "Lilac", swatch: "#C084FC", flow_3bar: 0.99 },
  { code: "03",  colour: "Blue", swatch: "#60A5FA", flow_3bar: 1.18 },
  { code: "04",  colour: "Red", swatch: "#F87171", flow_3bar: 1.58 },
  { code: "05",  colour: "Brown", swatch: "#B45309", flow_3bar: 1.97 },
  { code: "06",  colour: "Grey", swatch: "#9CA3AF", flow_3bar: 2.37 },
  { code: "08",  colour: "White", swatch: "#F3F4F6", flow_3bar: 3.16 },
] as const;

export default function NozzleGuide() {
  const insets = useSafeAreaInsets();
  const [rate, setRate] = useState("80");
  const [speed, setSpeed] = useState("18");
  const [spacing_, setSpacing] = useState("0.5");
  const [pressure, setPressure] = useState("3");

  const required = useMemo(() => nozzleFlowLpm(parseFloat(rate) || 0, parseFloat(speed) || 0, parseFloat(spacing_) || 0), [rate, speed, spacing_]);
  const p = parseFloat(pressure) || 3;

  // actual flow at operating pressure = rated_flow * sqrt(P / 3)
  const ranked = useMemo(() => {
    if (required <= 0) return [];
    const scale = Math.sqrt(p / 3);
    return ISO_NOZZLES.map((n) => {
      const actual = n.flow_3bar * scale;
      const diffPct = ((actual - required) / required) * 100;
      return { ...n, actual, diffPct };
    }).sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct));
  }, [required, p]);

  const best = ranked[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Nozzle Selection Guide" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Application rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="L/ha" testID="ng-rate" />
            <Input label="Speed" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" suffix="km/h" testID="ng-speed" />
            <Input label="Nozzle spacing" value={spacing_} onChangeText={setSpacing} keyboardType="decimal-pad" suffix="m" testID="ng-spacing" />
            <Input label="Operating pressure" value={pressure} onChangeText={setPressure} keyboardType="decimal-pad" suffix="bar" testID="ng-pressure" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary, alignItems: "center", padding: spacing.xl }}>
            <Text style={styles.reqLabel}>Required nozzle flow</Text>
            <Text style={styles.reqValue} testID="ng-required">{fmt(required)} L/min</Text>
            <Text style={styles.reqSub}>at {pressure} bar</Text>
          </Card>

          {best ? (
            <>
              <Text style={styles.section}>Suggested ISO 110° flat-fan</Text>
              <Card testID="ng-suggested" style={{ borderWidth: 2, borderColor: colors.brandPrimary }}>
                <View style={styles.row}>
                  <View style={[styles.swatch, { backgroundColor: best.swatch }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.isoCode}>ISO {best.code} · {best.colour}</Text>
                    <Text style={styles.flowLine}>{fmt(best.actual)} L/min @ {pressure} bar</Text>
                    <Text style={styles.diff}>{best.diffPct >= 0 ? "+" : ""}{fmt(best.diffPct, 1)}% vs required</Text>
                  </View>
                </View>
              </Card>

              <Text style={styles.section}>Nearby options</Text>
              {ranked.slice(1, 4).map((n) => (
                <Card key={n.code} style={{ marginBottom: spacing.sm }} testID={`ng-alt-${n.code}`}>
                  <View style={styles.row}>
                    <View style={[styles.swatch, { backgroundColor: n.swatch, width: 30, height: 30 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.altCode}>ISO {n.code} · {n.colour}</Text>
                      <Text style={styles.altLine}>{fmt(n.actual)} L/min · {n.diffPct >= 0 ? "+" : ""}{fmt(n.diffPct, 1)}%</Text>
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : (
            <Card><Text style={styles.empty}>Enter rate, speed and spacing to see a suggestion.</Text></Card>
          )}

          <View style={{ height: spacing.md }} />
          <Pressable onPress={() => Linking.openURL("https://fantasticnozzles.com.au")} testID="fantastic-link" style={styles.linkBtn}>
            <Text style={styles.linkText}>Browse nozzles at Fantastic Nozzles →</Text>
          </Pressable>

          <Text style={styles.discl}>
            ISO 110° flat-fan reference rates only. Confirm droplet size, drift class and product-label suitability before selecting a nozzle.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  reqLabel: { fontSize: 13, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 1 },
  reqValue: { fontSize: 42, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 4 },
  reqSub: { fontSize: 12, color: colors.onBrandSecondary, fontWeight: "600" },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  isoCode: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  flowLine: { fontSize: 14, color: colors.onSurface, marginTop: 2, fontWeight: "600" },
  diff: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "700" },
  altCode: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  altLine: { fontSize: 12, color: colors.muted, marginTop: 2 },
  linkBtn: { alignSelf: "center", paddingVertical: 10 },
  linkText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 14 },
  discl: { fontSize: 11, color: colors.muted, textAlign: "center", marginTop: spacing.md, lineHeight: 15, paddingHorizontal: 20, fontStyle: "italic" },
  empty: { color: colors.muted, textAlign: "center" },
});
