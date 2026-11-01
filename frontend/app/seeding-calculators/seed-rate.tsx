import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { seedingRateKgHa, seedsSownPerM2, totalSeedKg, bagsNeeded, fmt } from "@/src/lib/calculators";

export default function SeedRateCalc() {
  const insets = useSafeAreaInsets();
  const [targetPlants, setTargetPlants] = useState("150");
  const [tsw, setTsw] = useState("40");
  const [germination, setGermination] = useState("95");
  const [establishment, setEstablishment] = useState("85");
  const [area, setArea] = useState("");
  const [bagSize, setBagSize] = useState("25");

  const rate = useMemo(
    () => seedingRateKgHa(parseFloat(targetPlants) || 0, parseFloat(tsw) || 0, parseFloat(germination) || 0, parseFloat(establishment) || 0),
    [targetPlants, tsw, germination, establishment],
  );
  const sownPerM2 = useMemo(() => seedsSownPerM2(rate, parseFloat(tsw) || 0), [rate, tsw]);
  const areaHa = parseFloat(area) || 0;
  const totalKg = useMemo(() => totalSeedKg(rate, areaHa), [rate, areaHa]);
  const bags = useMemo(() => bagsNeeded(totalKg, parseFloat(bagSize) || 0), [totalKg, bagSize]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Seeding Rate Calculator" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Target plant density" value={targetPlants} onChangeText={setTargetPlants} keyboardType="decimal-pad" suffix="plants/m²" testID="input-target-plants" />
            <Input label="Thousand seed weight (TSW)" value={tsw} onChangeText={setTsw} keyboardType="decimal-pad" suffix="g" testID="input-tsw" />
            <Input label="Germination" value={germination} onChangeText={setGermination} keyboardType="decimal-pad" suffix="%" testID="input-germination" />
            <Input label="Establishment" value={establishment} onChangeText={setEstablishment} keyboardType="decimal-pad" suffix="%" testID="input-establishment" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card>
            <Input label="Paddock area (optional)" value={area} onChangeText={setArea} keyboardType="decimal-pad" suffix="ha" testID="input-area" />
            <Input label="Bag size (optional)" value={bagSize} onChangeText={setBagSize} keyboardType="decimal-pad" suffix="kg" testID="input-bag-size" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Seeding rate</Text>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Seed rate</Text><Text style={styles.rowValue}>{fmt(rate, 1)} kg/ha</Text></View>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Seeds sown</Text><Text style={styles.rowValue}>{fmt(sownPerM2, 0)} /m²</Text></View>
            {areaHa > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.resRow}><Text style={styles.rowLabel}>Total seed required</Text><Text style={styles.rowValue}>{fmt(totalKg, 0)} kg</Text></View>
                {parseFloat(bagSize) > 0 && (
                  <View style={styles.resRow}><Text style={styles.rowLabel}>Bags needed</Text><Text style={styles.rowValue}>{bags}</Text></View>
                )}
              </>
            )}
          </Card>
          <Text style={styles.hint}>Accounts for seed lost to poor germination and establishment — sown seeds per m² will always be higher than your target plant density.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  resRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 16, color: colors.onBrandSecondary, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.brandPrimary, opacity: 0.2, marginVertical: 4 },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
});
