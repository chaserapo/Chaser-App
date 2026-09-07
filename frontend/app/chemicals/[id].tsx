import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { CHEMICAL_CATEGORIES, ChemicalCategory, RATE_UNITS, RateUnit } from "@/src/lib/types";
import type { Chemical } from "@/src/lib/types";

export default function ChemicalDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Chemical | null>(null);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<ChemicalCategory>("Herbicide");
  const [rateUnit, setRateUnit] = useState<RateUnit>("L/ha");
  const [f, setF] = useState({
    product_name: "", active_ingredient: "", formulation: "",
    apvma_number: "", chemical_group: "", manufacturer: "",
    pack_size: "", default_rate: "",
    stock_qty: "", stock_unit: "", storage_location: "",
    label_url: "", sds_url: "", notes: "",
  });

  const loadState = (chem: Chemical) => {
    setType(chem.product_type ?? "Herbicide");
    setRateUnit(chem.default_unit ?? "L/ha");
    setF({
      product_name: chem.product_name,
      active_ingredient: chem.active_ingredient ?? "",
      formulation: chem.formulation ?? "",
      apvma_number: chem.apvma_number ?? "",
      chemical_group: chem.chemical_group ?? "",
      manufacturer: chem.manufacturer ?? "",
      pack_size: chem.pack_size ?? "",
      default_rate: chem.default_rate != null ? chem.default_rate.toString() : "",
      stock_qty: chem.stock_qty != null ? chem.stock_qty.toString() : "",
      stock_unit: chem.stock_unit ?? "",
      storage_location: chem.storage_location ?? "",
      label_url: chem.label_url ?? "",
      sds_url: chem.sds_url ?? "",
      notes: chem.notes ?? "",
    });
  };

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const chem = await repo.chemicals.get(id as string);
      setC(chem);
      if (chem) loadState(chem);
    })();
  }, [id]));

  async function save() {
    if (!c || !f.product_name.trim()) return;
    const next: Chemical = {
      ...c,
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
    };
    await repo.chemicals.save(next);
    setC(next);
    setEditing(false);
  }

  async function archive() {
    if (!c) return;
    await repo.chemicals.save({ ...c, archived_at: new Date().toISOString() });
    router.back();
  }
  async function unarchive() {
    if (!c) return;
    const next = { ...c, archived_at: undefined };
    await repo.chemicals.save(next);
    setC(next);
  }

  if (!c) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Chemical" back /></View>;

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value ?? "—"}</Text></View>
  );

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <ScreenHeader title="Edit Chemical" back />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
            <Card>
              <Input label="Product name*" value={f.product_name} onChangeText={(v) => setF({ ...f, product_name: v })} testID="edit-product-name" />
              <Text style={styles.chipLabel}>Product type</Text>
              <View style={styles.typeGrid}>
                {CHEMICAL_CATEGORIES.map((cc) => (
                  <Pressable key={cc} onPress={() => setType(cc)} style={[styles.typeChip, type === cc && styles.typeChipActive]} testID={`edit-type-${cc}`}>
                    <Text style={[styles.typeText, type === cc && { color: colors.onBrandPrimary }]}>{cc}</Text>
                  </Pressable>
                ))}
              </View>
              <Input label="Active ingredient" value={f.active_ingredient} onChangeText={(v) => setF({ ...f, active_ingredient: v })} testID="edit-ai" />
              <Input label="Concentration / formulation" value={f.formulation} onChangeText={(v) => setF({ ...f, formulation: v })} testID="edit-form" />
              <Input label="APVMA registration number" value={f.apvma_number} onChangeText={(v) => setF({ ...f, apvma_number: v })} testID="edit-apvma" />
              <Input label="Mode of action / group" value={f.chemical_group} onChangeText={(v) => setF({ ...f, chemical_group: v })} testID="edit-group" />
              <Input label="Manufacturer" value={f.manufacturer} onChangeText={(v) => setF({ ...f, manufacturer: v })} testID="edit-manufacturer" />
            </Card>

            <Text style={styles.section}>Default rate</Text>
            <Card>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Rate" value={f.default_rate} onChangeText={(v) => setF({ ...f, default_rate: v })} keyboardType="decimal-pad" testID="edit-default-rate" /></View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.chipLabel}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {RATE_UNITS.filter((u) => u !== "Custom").map((u) => (
                      <Pressable key={u} onPress={() => setRateUnit(u)} style={[styles.unitChip, rateUnit === u && styles.unitChipActive]} testID={`edit-unit-${u}`}>
                        <Text style={[styles.unitText, rateUnit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </Card>

            <Text style={styles.section}>Inventory</Text>
            <Card>
              <Input label="Pack size" value={f.pack_size} onChangeText={(v) => setF({ ...f, pack_size: v })} testID="edit-pack" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Stock quantity" value={f.stock_qty} onChangeText={(v) => setF({ ...f, stock_qty: v })} keyboardType="decimal-pad" testID="edit-stock-qty" /></View>
                <View style={{ flex: 1 }}><Input label="Stock unit" value={f.stock_unit} onChangeText={(v) => setF({ ...f, stock_unit: v })} testID="edit-stock-unit" /></View>
              </View>
              <Input label="Storage location" value={f.storage_location} onChangeText={(v) => setF({ ...f, storage_location: v })} testID="edit-storage" />
            </Card>

            <Text style={styles.section}>Links</Text>
            <Card>
              <Input label="Label URL" value={f.label_url} onChangeText={(v) => setF({ ...f, label_url: v })} testID="edit-label-url" />
              <Input label="SDS URL" value={f.sds_url} onChangeText={(v) => setF({ ...f, sds_url: v })} testID="edit-sds-url" />
              <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="edit-notes" />
            </Card>

            <View style={{ height: spacing.md }} />
            <Button title="Save Changes" icon="content-save-outline" onPress={save} disabled={!f.product_name.trim()} testID="save-chem-edit-btn" />
            <View style={{ height: spacing.sm }} />
            <Button title="Cancel" variant="outline" onPress={() => { setEditing(false); loadState(c); }} testID="cancel-chem-edit-btn" />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={c.product_name} back right={
        <Pressable onPress={() => setEditing(true)} testID="edit-chem-btn"><Icon name="pencil" size={22} color={colors.brandPrimary} /></Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text style={styles.pName}>{c.product_name}</Text>
            {c.product_type ? <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{c.product_type}</Text></View> : null}
            {c.archived_at ? <View style={styles.archBadge}><Text style={styles.archBadgeText}>Archived</Text></View> : null}
          </View>
          {c.active_ingredient ? <Text style={styles.ai}>{c.active_ingredient}</Text> : null}
          {c.formulation ? <Text style={styles.form}>{c.formulation}</Text> : null}
        </Card>

        <Text style={styles.section}>Identification</Text>
        <Card>
          <Field label="APVMA registration" value={c.apvma_number} />
          <Field label="Chemical group / MoA" value={c.chemical_group} />
          <Field label="Manufacturer" value={c.manufacturer} />
        </Card>

        <Text style={styles.section}>Default rate</Text>
        <Card>
          <Field label="Rate" value={c.default_rate != null ? `${c.default_rate} ${c.default_unit ?? ""}` : undefined} />
          <Text style={styles.hint}>HectareHQ never suggests application rates. This is your saved default.</Text>
        </Card>

        <Text style={styles.section}>Inventory</Text>
        <Card>
          <Field label="Pack size" value={c.pack_size} />
          <Field label="Current stock" value={c.stock_qty != null ? `${c.stock_qty} ${c.stock_unit ?? c.pack_size ?? ""}` : undefined} />
          <Field label="Storage location" value={c.storage_location} />
        </Card>

        {(c.label_url || c.sds_url) && (
          <>
            <Text style={styles.section}>Documents</Text>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {c.label_url ? (
                <Pressable onPress={() => Linking.openURL(c.label_url!)} style={styles.linkRow} testID="chem-label-link">
                  <Icon name="file-document-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.linkText}>View Label</Text>
                  <Icon name="open-in-new" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              {c.sds_url ? (
                <Pressable onPress={() => Linking.openURL(c.sds_url!)} style={[styles.linkRow, { borderTopWidth: c.label_url ? 1 : 0, borderTopColor: colors.border }]} testID="chem-sds-link">
                  <Icon name="shield-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.linkText}>View SDS</Text>
                  <Icon name="open-in-new" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </Card>
          </>
        )}

        {c.notes ? (<>
          <Text style={styles.section}>Notes</Text>
          <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{c.notes}</Text></Card>
        </>) : null}

        <View style={{ height: spacing.lg }} />
        <Button title="Edit Product" icon="pencil" variant="secondary" onPress={() => setEditing(true)} testID="edit-product-btn" />
        <View style={{ height: spacing.sm }} />
        {c.archived_at ? (
          <Button title="Unarchive Product" icon="archive-arrow-up-outline" onPress={unarchive} testID="unarchive-chem-btn" />
        ) : (
          <Button title="Archive Product" icon="archive-outline" variant="danger" onPress={archive} testID="archive-chem-btn" />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  pName: { fontSize: 22, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  ai: { fontSize: 14, color: colors.onSurfaceTertiary, marginTop: 6, fontWeight: "600" },
  form: { fontSize: 13, color: colors.muted, marginTop: 2 },
  typeBadge: { backgroundColor: colors.brandSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  typeBadgeText: { fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  archBadge: { backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  archBadgeText: { fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  linkRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 56, gap: 12 },
  linkText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", lineHeight: 17, marginTop: 6 },
  chipLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  typeChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  typeChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  typeText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  unitChip: { paddingHorizontal: 12, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
});
