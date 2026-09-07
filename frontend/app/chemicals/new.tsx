import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { CHEMICAL_CATEGORIES, ChemicalCategory, RATE_UNITS, RateUnit } from "@/src/lib/types";
import type { Chemical } from "@/src/lib/types";

export default function NewChemical() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState<ChemicalCategory>("Herbicide");
  const [rateUnit, setRateUnit] = useState<RateUnit>("L/ha");
  const [f, setF] = useState({
    product_name: "", active_ingredient: "", formulation: "",
    apvma_number: "", chemical_group: "", manufacturer: "",
    pack_size: "", default_rate: "",
    stock_qty: "", stock_unit: "", storage_location: "",
    label_url: "", sds_url: "", notes: "",
  });

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !f.product_name.trim()) return;
    const c: Chemical = {
      id: uuid(),
      business_id: business.id,
      product_name: f.product_name.trim(),
      product_type: type,
      active_ingredient: f.active_ingredient.trim() || undefined,
      formulation: f.formulation.trim() || undefined,
      apvma_number: f.apvma_number.trim() || undefined,
      chemical_group: f.chemical_group.trim() || undefined,
      manufacturer: f.manufacturer.trim() || undefined,
      pack_size: f.pack_size.trim() || undefined,
      default_rate: f.default_rate ? parseFloat(f.default_rate) : undefined,
      default_unit: f.default_rate ? rateUnit : undefined,
      stock_qty: f.stock_qty ? parseFloat(f.stock_qty) : undefined,
      stock_unit: f.stock_unit.trim() || undefined,
      storage_location: f.storage_location.trim() || undefined,
      label_url: f.label_url.trim() || undefined,
      sds_url: f.sds_url.trim() || undefined,
      notes: f.notes.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.chemicals.save(c);
    router.replace({ pathname: "/chemicals/[id]", params: { id: c.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Add Chemical" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">

          <Card>
            <Input label="Product name*" value={f.product_name} onChangeText={(v) => setF({ ...f, product_name: v })} testID="input-product-name" />

            <Text style={styles.label}>Product type*</Text>
            <View style={styles.typeGrid}>
              {CHEMICAL_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setType(c)} style={[styles.typeChip, type === c && styles.typeChipActive]} testID={`type-chip-${c}`}>
                  <Text style={[styles.typeText, type === c && { color: colors.onBrandPrimary }]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <Input label="Active ingredient" value={f.active_ingredient} onChangeText={(v) => setF({ ...f, active_ingredient: v })} placeholder="e.g. Glyphosate 540 g/L" testID="input-ai" />
            <Input label="Concentration / formulation" value={f.formulation} onChangeText={(v) => setF({ ...f, formulation: v })} placeholder="e.g. Soluble concentrate" testID="input-formulation" />
            <Input label="APVMA registration number" value={f.apvma_number} onChangeText={(v) => setF({ ...f, apvma_number: v })} keyboardType="numeric" testID="input-apvma" />
            <Input label="Mode of action / group" value={f.chemical_group} onChangeText={(v) => setF({ ...f, chemical_group: v })} placeholder="e.g. M (Glycines)" testID="input-group" />
            <Input label="Manufacturer" value={f.manufacturer} onChangeText={(v) => setF({ ...f, manufacturer: v })} testID="input-manufacturer" />
          </Card>

          <Text style={styles.section}>Default rate (yours)</Text>
          <Card>
            <Text style={styles.hint}>HectareHQ never suggests application rates. Save your own default here.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input label="Rate" value={f.default_rate} onChangeText={(v) => setF({ ...f, default_rate: v })} keyboardType="decimal-pad" testID="input-default-rate" />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={styles.label}>Unit</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {RATE_UNITS.filter((u) => u !== "Custom").map((u) => (
                    <Pressable key={u} onPress={() => setRateUnit(u)} style={[styles.unitChip, rateUnit === u && styles.unitChipActive]} testID={`default-unit-${u}`}>
                      <Text style={[styles.unitText, rateUnit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Card>

          <Text style={styles.section}>Inventory</Text>
          <Card>
            <Input label="Pack size" value={f.pack_size} onChangeText={(v) => setF({ ...f, pack_size: v })} placeholder="e.g. 20 L" testID="input-pack" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Stock quantity" value={f.stock_qty} onChangeText={(v) => setF({ ...f, stock_qty: v })} keyboardType="decimal-pad" testID="input-stock-qty" /></View>
              <View style={{ flex: 1 }}><Input label="Stock unit" value={f.stock_unit} onChangeText={(v) => setF({ ...f, stock_unit: v })} placeholder="packs, L, kg" testID="input-stock-unit" /></View>
            </View>
            <Input label="Storage location" value={f.storage_location} onChangeText={(v) => setF({ ...f, storage_location: v })} placeholder="e.g. Chem shed A" testID="input-storage" />
          </Card>

          <Text style={styles.section}>Links</Text>
          <Card>
            <Input label="Label URL" value={f.label_url} onChangeText={(v) => setF({ ...f, label_url: v })} testID="input-label-url" />
            <Input label="SDS URL" value={f.sds_url} onChangeText={(v) => setF({ ...f, sds_url: v })} testID="input-sds-url" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-notes" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title="Save Chemical" icon="content-save-outline" onPress={save} disabled={!f.product_name.trim()} testID="save-chem-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  typeChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  unitChip: { paddingHorizontal: 12, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 17 },
});
