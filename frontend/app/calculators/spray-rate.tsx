import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/header";
import { Input, Card } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { nozzleFlowLpm, numNozzles, totalBoomFlowLpm, hectaresPerTank, chemicalPerTank, fmt } from "@/src/lib/calculators";

export default function SprayRateCalc() {
  const insets = useSafeAreaInsets();
  const [rate, setRate] = useState("80");
  const [speed, setSpeed] = useState("18");
  const [spacing_, setSpacing] = useState("0.5");
  const [boom, setBoom] = useState("30");
  const [tank, setTank] = useState("4000");
  const [chemRate, setChemRate] = useState("1.5");

  const r = parseFloat(rate) || 0;
  const s = parseFloat(speed) || 0;
  const sp = parseFloat(spacing_) || 0;
  const bw = parseFloat(boom) || 0;
  const t = parseFloat(tank) || 0;
  const cr = parseFloat(chemRate) || 0;

  const results = useMemo(() => {
    const nozzle = nozzleFlowLpm(r, s, sp);
    const nn = numNozzles(bw, sp);
    const total = totalBoomFlowLpm(nozzle, nn);
    const hpt = hectaresPerTank(t, r);
    const chem = chemicalPerTank(cr, hpt);
    return { nozzle, nn, total, hpt, chem };
  }, [r, s, sp, bw, t, cr]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Spray Rate Calculator" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Application rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="L/ha" testID="input-rate" />
            <Input label="Speed" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" suffix="km/h" testID="input-speed" />
            <Input label="Nozzle spacing" value={spacing_} onChangeText={setSpacing} keyboardType="decimal-pad" suffix="m" testID="input-spacing" />
            <Input label="Boom width" value={boom} onChangeText={setBoom} keyboardType="decimal-pad" suffix="m" testID="input-boom" />
            <Input label="Tank capacity" value={tank} onChangeText={setTank} keyboardType="decimal-pad" suffix="L" testID="input-tank" />
            <Input label="Chemical rate" value={chemRate} onChangeText={setChemRate} keyboardType="decimal-pad" suffix="L/ha" testID="input-chem-rate" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Results</Text>
            <ResultRow label="Nozzle flow" value={`${fmt(results.nozzle)} L/min`} testID="result-nozzle-flow" />
            <ResultRow label="Number of nozzles" value={`${results.nn}`} testID="result-nozzles" />
            <ResultRow label="Total boom flow" value={`${fmt(results.total)} L/min`} testID="result-boom-flow" />
            <ResultRow label="Hectares per tank" value={`${fmt(results.hpt)} ha`} testID="result-hpt" />
            <ResultRow label="Chemical per tank" value={`${fmt(results.chem)} L`} testID="result-chem-tank" last />
          </Card>

          <Text style={styles.formula}>
            L/min per nozzle = L/ha × speed × nozzle spacing ÷ 600
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ResultRow({ label, value, last, testID }: { label: string; value: string; last?: boolean; testID?: string }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]} testID={testID}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.brandPrimary + "20" },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 18, color: colors.onBrandSecondary, fontWeight: "800" },
  formula: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.lg, fontStyle: "italic" },
});
