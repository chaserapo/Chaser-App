import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { blendTotalForArea, fmt, type BlendUnit } from "@/src/lib/calculators";
import { v4 as uuid } from "uuid";

type Row = { id: string; name: string; rate: string; unit: BlendUnit; costPerUnit: string };

const UNITS: BlendUnit[] = ["kg/ha", "L/ha", "g/ha", "Custom"];

export default function FertiliserBlendCalc() {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState("100");
  const [rows, setRows] = useState<Row[]>([{ id: uuid(), name: "", rate: "80", unit: "kg/ha", costPerUnit: "" }]);

  const areaHa = parseFloat(area) || 0;

  const results = useMemo(
    () => rows.map((r) => blendTotalForArea(parseFloat(r.rate) || 0, r.unit, areaHa)),
    [rows, areaHa],
  );

  const totalCost = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    rows.forEach((r, i) => {
      const cost = parseFloat(r.costPerUnit);
      if (!isNaN(cost) && results[i]) {
        sum += cost * results[i].amount;
        hasAny = true;
      }
    });
    return hasAny ? sum : undefined;
  }, [rows, results]);

  function addRow() { setRows((rs) => [...rs, { id: uuid(), name: "", rate: "1", unit: "kg/ha", costPerUnit: "" }]); }
  function removeRow(id: string) { setRows((rs) => rs.filter((r) => r.id !== id)); }
  function updateRow(id: string, patch: Partial<Row>) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Starter Fertiliser Blend" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Paddock area" value={area} onChangeText={setArea} keyboardType="decimal-pad" suffix="ha" testID="input-area" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Text style={styles.section}>Products</Text>

          {rows.map((r, idx) => (
            <Card key={r.id} style={{ marginBottom: spacing.md }} testID={`product-row-${idx}`}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowIdx}>Product {idx + 1}</Text>
                {rows.length > 1 && (
                  <Pressable onPress={() => removeRow(r.id)} testID={`remove-product-${idx}`}>
                    <Icon name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                )}
              </View>

              <Input label="Product name" value={r.name} onChangeText={(t) => updateRow(r.id, { name: t })} testID={`input-product-name-${idx}`} />

              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Rate" value={r.rate} onChangeText={(t) => updateRow(r.id, { rate: t })} keyboardType="decimal-pad" testID={`input-rate-${idx}`} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitLabel}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {UNITS.map((u) => (
                      <Pressable key={u} onPress={() => updateRow(r.id, { unit: u })} style={[styles.unitChip, r.unit === u && styles.unitChipActive]} testID={`unit-${idx}-${u}`}>
                        <Text style={[styles.unitChipText, r.unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <Input label="Cost per unit (optional)" value={r.costPerUnit} onChangeText={(t) => updateRow(r.id, { costPerUnit: t })} keyboardType="decimal-pad" suffix="$" testID={`input-cost-${idx}`} />

              <Text style={styles.amount}>
                Total for paddock: <Text style={{ fontWeight: "800" }}>{fmt(results[idx]?.amount ?? 0)} {results[idx]?.unit}</Text>
              </Text>
            </Card>
          ))}

          <Button title="Add another product" icon="plus" variant="outline" onPress={addRow} testID="add-product-btn" />

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Blend total</Text>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Paddock area</Text><Text style={styles.rowValue}>{fmt(areaHa, 1)} ha</Text></View>
            {totalCost != null && (
              <View style={styles.resRow}><Text style={styles.rowLabel}>Estimated cost</Text><Text style={styles.rowValue}>${fmt(totalCost, 0)}</Text></View>
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  rowIdx: { fontSize: 13, fontWeight: "700", color: colors.muted },
  unitLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  amount: { marginTop: 6, fontSize: 14, color: colors.onSurface },
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  resRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 16, color: colors.onBrandSecondary, fontWeight: "800" },
});
