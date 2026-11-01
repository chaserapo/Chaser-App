import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { seedTreatmentTotal, fmt, type SeedTreatmentUnit } from "@/src/lib/calculators";

const UNITS: SeedTreatmentUnit[] = ["mL/t", "L/t", "g/t", "kg/t"];

export default function SeedTreatmentCalc() {
  const insets = useSafeAreaInsets();
  const [seedTonnes, setSeedTonnes] = useState("");
  const [rate, setRate] = useState("200");
  const [unit, setUnit] = useState<SeedTreatmentUnit>("mL/t");

  const tonnes = parseFloat(seedTonnes) || 0;
  const result = useMemo(() => seedTreatmentTotal(parseFloat(rate) || 0, unit, tonnes), [rate, unit, tonnes]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Seed Treatment / Inoculant" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Seed to treat" value={seedTonnes} onChangeText={setSeedTonnes} keyboardType="decimal-pad" suffix="t" testID="input-seed-tonnes" />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input label="Treatment rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" testID="input-rate" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.unitLabel}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {UNITS.map((u) => (
                    <Pressable key={u} onPress={() => setUnit(u)} style={[styles.unitChip, unit === u && styles.unitChipActive]} testID={`unit-${u}`}>
                      <Text style={[styles.unitChipText, unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Total treatment required</Text>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Amount</Text><Text style={styles.rowValue}>{fmt(result.amount, 1)} {result.unit}</Text></View>
          </Card>
          <Text style={styles.hint}>Check the product label — some treatments are rated per tonne of seed, others per hectare sown. This calculator assumes a per-tonne rate.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  unitLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  resRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 16, color: colors.onBrandSecondary, fontWeight: "800" },
  hint: { fontSize: 12, color: colors.muted, marginTop: spacing.sm, lineHeight: 17 },
});
