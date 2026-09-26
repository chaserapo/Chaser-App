import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { CHEMICAL_CATEGORIES, ChemicalCategory, PACK_SIZE_PRESETS, RATE_UNITS, RateUnit } from "@/src/lib/types";
import type { Chemical } from "@/src/lib/types";
import { groupOptionsFor } from "@/src/lib/chemical-groups";
import { ApvmaSearch } from "@/src/features/chemicals/ApvmaSearch";
import { mapApvmaCategory, type ApvmaProduct } from "@/src/lib/apvma";

export default function NewChemical() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState<ChemicalCategory>("Herbicide");
  const [rateUnit, setRateUnit] = useState<RateUnit>("L/ha");
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [f, setF] = useState({
    product_name: "", active_ingredient: "", formulation: "",
    apvma_number: "", manufacturer: "",
    pack_size: "", default_rate: "",
    stock_qty: "", stock_unit: "", cost_per_unit: "", low_stock_threshold: "", storage_location: "",
    label_url: "", sds_url: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !f.product_name.trim()) return;
    setSaving(true);
    setError(null);
    const c: Chemical = {
      id: uuid(),
      business_id: business.id,
      product_name: f.product_name.trim(),
      product_type: type,
      active_ingredient: f.active_ingredient.trim() || undefined,
      formulation: f.formulation.trim() || undefined,
      apvma_number: f.apvma_number.trim() || undefined,
      chemical_group_key: groupKey ?? undefined,
      manufacturer: f.manufacturer.trim() || undefined,
      pack_size: f.pack_size.trim() || undefined,
      default_rate: f.default_rate ? parseFloat(f.default_rate) : undefined,
      default_unit: f.default_rate ? rateUnit : undefined,
      stock_qty: f.stock_qty ? parseFloat(f.stock_qty) : undefined,
      stock_unit: f.stock_unit.trim() || undefined,
      cost_per_unit: f.cost_per_unit ? parseFloat(f.cost_per_unit) : undefined,
      low_stock_threshold: f.low_stock_threshold ? parseFloat(f.low_stock_threshold) : undefined,
      storage_location: f.storage_location.trim() || undefined,
      label_url: f.label_url.trim() || undefined,
      sds_url: f.sds_url.trim() || undefined,
      notes: f.notes.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    try {
      await repo.chemicals.save(c);
      router.replace({ pathname: "/chemicals/[id]", params: { id: c.id } });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save this chemical");
    } finally {
      setSaving(false);
    }
  }

  function applyApvmaProduct(p: ApvmaProduct) {
    setF({
      ...f,
      product_name: p.productName,
      manufacturer: p.holder || f.manufacturer,
      apvma_number: p.pcode || f.apvma_number,
      formulation: p.formulation || f.formulation,
    });
    const mapped = mapApvmaCategory(p.category);
    if (mapped) setType(mapped);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Add Chemical" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">

          <Card>
            <ApvmaSearch onSelect={applyApvmaProduct} />
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

            <Text style={styles.label}>Mode of action / group</Text>
            <View style={styles.typeGrid}>
              {groupOptionsFor(type).map((g) => (
                <Pressable key={g.key} onPress={() => setGroupKey(g.key)} style={[styles.groupChip, groupKey === g.key && styles.typeChipActive]} testID={`group-chip-${g.key}`}>
                  <Text style={[styles.typeText, groupKey === g.key && { color: colors.onBrandPrimary }]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.groupCaveat}>Group numbers are a general guide, assembled from HRAC/FRAC/IRAC references — check your product label if unsure. Used to warn you if you repeat a group on the same paddock across seasons.</Text>
            <Input label="Manufacturer" value={f.manufacturer} onChangeText={(v) => setF({ ...f, manufacturer: v })} testID="input-manufacturer" />
          </Card>

          <Text style={styles.section}>Default rate (yours)</Text>
          <Card>
            <Text style={styles.hint}>Chaser never suggests application rates. Save your own default here.</Text>
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
            <Text style={styles.label}>Or pick a common size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: spacing.md }}>
              {PACK_SIZE_PRESETS.map((size) => (
                <Pressable key={size} onPress={() => setF({ ...f, pack_size: size, stock_unit: f.stock_unit.trim() ? f.stock_unit : size })} style={[styles.unitChip, f.pack_size === size && styles.unitChipActive]} testID={`pack-size-${size}`}>
                  <Text style={[styles.unitText, f.pack_size === size && { color: colors.onBrandPrimary }]}>{size}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Stock quantity" value={f.stock_qty} onChangeText={(v) => setF({ ...f, stock_qty: v })} keyboardType="decimal-pad" placeholder="e.g. 4" testID="input-stock-qty" /></View>
              <View style={{ flex: 1 }}><Input label="Stock unit" value={f.stock_unit} onChangeText={(v) => setF({ ...f, stock_unit: v })} placeholder="packs, L, kg" testID="input-stock-unit" /></View>
            </View>
            <Input label="Cost per unit (optional)" value={f.cost_per_unit} onChangeText={(v) => setF({ ...f, cost_per_unit: v })} keyboardType="decimal-pad" suffix={`AUD / ${f.stock_unit.trim() || "unit"}`} placeholder="e.g. 12.50" testID="input-cost-per-unit" />
            <Input label="Low stock warning (optional)" value={f.low_stock_threshold} onChangeText={(v) => setF({ ...f, low_stock_threshold: v })} keyboardType="decimal-pad" placeholder="Leave blank to use your default" testID="input-low-stock" />
            <Input label="Storage location" value={f.storage_location} onChangeText={(v) => setF({ ...f, storage_location: v })} placeholder="e.g. Chem shed A" testID="input-storage" />
          </Card>

          <Text style={styles.section}>Links</Text>
          <Card>
            <Input label="Label URL" value={f.label_url} onChangeText={(v) => setF({ ...f, label_url: v })} testID="input-label-url" />
            <Input label="SDS URL" value={f.sds_url} onChangeText={(v) => setF({ ...f, sds_url: v })} testID="input-sds-url" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-notes" />
          </Card>

          {error ? (
            <View style={styles.errorBox} testID="save-chem-error">
              <Icon name="alert-circle-outline" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <View style={{ height: spacing.md }} />
          <Button title="Save Chemical" icon="content-save-outline" onPress={save} loading={saving} disabled={saving || !f.product_name.trim()} testID="save-chem-btn" />
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
  groupChip: { paddingHorizontal: 12, paddingVertical: 8, maxWidth: "100%", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  groupCaveat: { fontSize: 11, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 15 },
  typeText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  unitChip: { paddingHorizontal: 12, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginBottom: spacing.md, lineHeight: 17 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
