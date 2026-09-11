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
import { MACHINE_TYPES, MachineType } from "@/src/lib/types";
import { NOZZLES } from "@/src/lib/nozzles";
import type { Machinery } from "@/src/lib/types";

export default function NewMachine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState<MachineType>("Tractor");
  const [nozzlePickerOpen, setNozzlePickerOpen] = useState(false);
  const [f, setF] = useState({
    name: "", make: "", model: "", year: "",
    serial_number: "", registration: "",
    current_hours: "", current_km: "", purchase_date: "", notes: "",
    tank_capacity_l: "", boom_width_m: "", nozzle_spacing_m: "", nozzle_positions: "",
    default_nozzle: "", default_speed_kmh: "", default_water_rate_lha: "",
  });

  const selectedNozzle = NOZZLES.find((n) => n.id === f.default_nozzle) ?? null;

  const isSprayer = type === "Self-propelled sprayer" || type === "Tow-behind sprayer";

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !f.name.trim()) return;
    const m: Machinery = {
      id: uuid(),
      business_id: business.id,
      name: f.name.trim(),
      machine_type: type,
      make: f.make || undefined,
      model: f.model || undefined,
      year: f.year ? parseInt(f.year) : undefined,
      serial_number: f.serial_number || undefined,
      registration: f.registration || undefined,
      current_hours: f.current_hours ? parseFloat(f.current_hours) : undefined,
      current_km: f.current_km ? parseFloat(f.current_km) : undefined,
      purchase_date: f.purchase_date || undefined,
      notes: f.notes || undefined,
      tank_capacity_l: isSprayer && f.tank_capacity_l ? parseFloat(f.tank_capacity_l) : undefined,
      boom_width_m: isSprayer && f.boom_width_m ? parseFloat(f.boom_width_m) : undefined,
      nozzle_spacing_m: isSprayer && f.nozzle_spacing_m ? parseFloat(f.nozzle_spacing_m) / 1000 : undefined,
      nozzle_positions: isSprayer && f.nozzle_positions ? parseInt(f.nozzle_positions) : undefined,
      default_nozzle: isSprayer ? (f.default_nozzle || undefined) : undefined,
      default_speed_kmh: isSprayer && f.default_speed_kmh ? parseFloat(f.default_speed_kmh) : undefined,
      default_water_rate_lha: isSprayer && f.default_water_rate_lha ? parseFloat(f.default_water_rate_lha) : undefined,
      created_at: new Date().toISOString(),
    };
    await repo.machinery.save(m);
    router.replace({ pathname: "/machinery/[id]", params: { id: m.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Machine" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Machine name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="input-machine-name" />
            <Text style={styles.label}>Type</Text>
            <View style={styles.grid}>
              {MACHINE_TYPES.map((t) => (
                <Pressable key={t} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipActive]} testID={`type-${t}`}>
                  <Text style={[styles.chipText, type === t && { color: colors.onBrandPrimary }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="Manufacturer" value={f.make} onChangeText={(v) => setF({ ...f, make: v })} testID="input-make" />
            <Input label="Model" value={f.model} onChangeText={(v) => setF({ ...f, model: v })} testID="input-model" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Year" value={f.year} onChangeText={(v) => setF({ ...f, year: v })} keyboardType="numeric" testID="input-year" /></View>
              <View style={{ flex: 1 }}><Input label="Registration" value={f.registration} onChangeText={(v) => setF({ ...f, registration: v })} testID="input-rego" /></View>
            </View>
            <Input label="Serial number" value={f.serial_number} onChangeText={(v) => setF({ ...f, serial_number: v })} testID="input-serial" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Current hours" value={f.current_hours} onChangeText={(v) => setF({ ...f, current_hours: v })} keyboardType="decimal-pad" suffix="h" testID="input-hours" /></View>
              <View style={{ flex: 1 }}><Input label="Current km" value={f.current_km} onChangeText={(v) => setF({ ...f, current_km: v })} keyboardType="decimal-pad" suffix="km" testID="input-km" /></View>
            </View>
            <Input label="Purchase date (YYYY-MM-DD)" value={f.purchase_date} onChangeText={(v) => setF({ ...f, purchase_date: v })} testID="input-purchase" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-notes" />
          </Card>

          {isSprayer && (
            <>
              <Text style={styles.section}>Sprayer setup</Text>
              <Card>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="Tank capacity" value={f.tank_capacity_l} onChangeText={(v) => setF({ ...f, tank_capacity_l: v })} keyboardType="decimal-pad" suffix="L" testID="input-tank" /></View>
                  <View style={{ flex: 1 }}><Input label="Boom width" value={f.boom_width_m} onChangeText={(v) => setF({ ...f, boom_width_m: v })} keyboardType="decimal-pad" suffix="m" testID="input-boom" /></View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="Nozzle spacing" value={f.nozzle_spacing_m} onChangeText={(v) => setF({ ...f, nozzle_spacing_m: v })} keyboardType="decimal-pad" suffix="mm" testID="input-spacing" /></View>
                  <View style={{ flex: 1 }}><Input label="Nozzle positions" value={f.nozzle_positions} onChangeText={(v) => setF({ ...f, nozzle_positions: v })} keyboardType="numeric" testID="input-positions" /></View>
                </View>
                <Text style={styles.pickerLabel}>Default nozzle</Text>
                <Pressable onPress={() => setNozzlePickerOpen((v) => !v)} testID="mach-nozzle-select" style={styles.nozzleBtn}>
                  <Text style={styles.nozzleBtnText}>
                    {selectedNozzle ? selectedNozzle.label : "Select a nozzle (optional)"}
                  </Text>
                  <Icon name={nozzlePickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                </Pressable>
                {nozzlePickerOpen ? (
                  <View style={styles.nozzlePickerWrap} testID="mach-nozzle-picker">
                    <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                      <Pressable onPress={() => { setF({ ...f, default_nozzle: "" }); setNozzlePickerOpen(false); }} style={styles.nozzleRow}>
                        <Text style={styles.nozzleClear}>None — clear selection</Text>
                      </Pressable>
                      {NOZZLES.map((n) => {
                        const active = f.default_nozzle === n.id;
                        return (
                          <Pressable
                            key={n.id}
                            onPress={() => { setF({ ...f, default_nozzle: n.id }); setNozzlePickerOpen(false); }}
                            style={[styles.nozzleRow, active && { backgroundColor: colors.brandSecondary }]}
                            testID={`mach-nozzle-option-${n.id}`}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.nozzleName}>{n.label}</Text>
                              <Text style={styles.nozzleSub}>{n.type} · {n.ratedFlowLpm.toFixed(2)} L/min @ {n.ratedPressureBar} bar</Text>
                            </View>
                            {active ? <Icon name="check" size={18} color={colors.brandPrimary} /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="Default speed" value={f.default_speed_kmh} onChangeText={(v) => setF({ ...f, default_speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" testID="input-def-speed" /></View>
                  <View style={{ flex: 1 }}><Input label="Default water rate" value={f.default_water_rate_lha} onChangeText={(v) => setF({ ...f, default_water_rate_lha: v })} keyboardType="decimal-pad" suffix="L/ha" testID="input-def-water" /></View>
                </View>
              </Card>
            </>
          )}

          <View style={{ height: spacing.md }} />
          <Button title="Save Machine" icon="content-save-outline" onPress={save} disabled={!f.name.trim()} testID="save-machine-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  chip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  pickerLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: 12, fontWeight: "600" },
  nozzleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: 12, height: 44, marginBottom: 4 },
  nozzleBtnText: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  nozzlePickerWrap: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: 4, padding: 4 },
  nozzleRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.sm, gap: 8 },
  nozzleName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  nozzleSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  nozzleClear: { fontSize: 12, color: colors.error, fontWeight: "700" },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
});
