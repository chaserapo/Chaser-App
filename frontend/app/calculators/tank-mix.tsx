import { useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { tankMix, fmt } from "@/src/lib/calculators";
import { repo } from "@/src/lib/storage";
import type { Chemical, RateUnit, SprayJob } from "@/src/lib/types";
import { v4 as uuid } from "uuid";

type Row = { id: string; chemical_id?: string; name: string; rate: string; unit: RateUnit };

const UNITS: RateUnit[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "%v/v"];

export default function TankMixCalc() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tank, setTank] = useState("4000");
  const [water, setWater] = useState("80");
  const [rows, setRows] = useState<Row[]>([{ id: uuid(), name: "", rate: "1.5", unit: "L/ha" }]);
  const [chemicals, setChemicals] = useState<Chemical[]>([]);

  useFocusEffect(useCallback(() => { repo.chemicals.list().then(setChemicals); }, []));

  const t = parseFloat(tank) || 0;
  const w = parseFloat(water) || 0;

  const results = useMemo(() => {
    return tankMix(t, w, rows.map((r) => ({ name: r.name || "Product", rate: parseFloat(r.rate) || 0, unit: r.unit })));
  }, [t, w, rows]);

  function addRow() { setRows((rs) => [...rs, { id: uuid(), name: "", rate: "1", unit: "L/ha" }]); }
  function removeRow(id: string) { setRows((rs) => rs.filter((r) => r.id !== id)); }
  function updateRow(id: string, patch: Partial<Row>) { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }

  function pickChemical(rowId: string, chem: Chemical) {
    updateRow(rowId, {
      chemical_id: chem.id,
      name: chem.product_name,
      rate: chem.default_rate?.toString() ?? "1",
      unit: (chem.default_unit as RateUnit) ?? "L/ha",
    });
  }

  async function saveAsRecord() {
    const business = await repo.getBusiness();
    if (!business) return;
    const job: SprayJob = {
      id: uuid(),
      business_id: business.id,
      status: "completed",
      date: new Date().toISOString().slice(0, 10),
      area_ha: results.ha_per_tank,
      water_rate: w,
      products: rows.map((r) => ({
        id: uuid(),
        chemical_id: r.chemical_id ?? "",
        chemical_name: r.name || "Product",
        rate: parseFloat(r.rate) || 0,
        unit: r.unit,
        total_qty: results.products.find((p) => p.name === (r.name || "Product"))?.amount,
      })),
      notes: "Saved from Tank Mix Calculator",
      created_at: new Date().toISOString(),
    };
    await repo.sprayJobs.save(job);
    router.replace({ pathname: "/records/[id]", params: { id: job.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Tank Mix Calculator" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Tank size" value={tank} onChangeText={setTank} keyboardType="decimal-pad" suffix="L" testID="input-tank-size" />
            <Input label="Water rate" value={water} onChangeText={setWater} keyboardType="decimal-pad" suffix="L/ha" testID="input-water-rate" />
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

              {chemicals.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
                  {chemicals.map((c) => (
                    <Pressable key={c.id} onPress={() => pickChemical(r.id, c)} style={styles.pickChip}>
                      <Text style={styles.pickChipText} numberOfLines={1}>
                        {c.product_name}{c.stock_qty != null ? ` · ${c.stock_qty} ${c.stock_unit ?? ""}`.trimEnd() : ""}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

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

              <Text style={styles.amount}>
                Amount for tank: <Text style={{ fontWeight: "800" }}>{fmt(results.products[idx]?.amount ?? 0)} {results.products[idx]?.amount_unit}</Text>
              </Text>
              {(() => {
                const selected = r.chemical_id ? chemicals.find((c) => c.id === r.chemical_id) : undefined;
                if (!selected || selected.stock_qty == null) return null;
                return (
                  <Text style={styles.stockLine} testID={`stock-line-${idx}`}>
                    Available stock: {selected.stock_qty} {selected.stock_unit ?? ""}
                  </Text>
                );
              })()}
            </Card>
          ))}

          <Button title="Add another product" icon="plus" variant="outline" onPress={addRow} testID="add-product-btn" />

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Total mixture</Text>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Hectares per tank</Text><Text style={styles.rowValue}>{fmt(results.ha_per_tank)} ha</Text></View>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Tank size</Text><Text style={styles.rowValue}>{fmt(t, 0)} L</Text></View>
            <View style={styles.resRow}><Text style={styles.rowLabel}>Water rate</Text><Text style={styles.rowValue}>{fmt(w, 0)} L/ha</Text></View>
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title="Save as Spray Record" icon="content-save-outline" onPress={saveAsRecord} testID="save-tank-mix-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  rowIdx: { fontSize: 13, fontWeight: "700", color: colors.muted },
  pickChip: { paddingHorizontal: 10, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", maxWidth: 180 },
  pickChipText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceTertiary },
  unitLabel: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 6 },
  unitChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  amount: { marginTop: 6, fontSize: 14, color: colors.onSurface },
  stockLine: { marginTop: 2, fontSize: 12, color: colors.muted },
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  resRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 16, color: colors.onBrandSecondary, fontWeight: "800" },
});
