import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { nozzleFlowLpm } from "@/src/lib/calculators";
import { MACHINE_TYPES, MachineType, type Machinery, type SprayerApplicationGoal, type SprayerApplicationMode } from "@/src/lib/types";
import { NOZZLES, recommendNozzles } from "@/src/lib/nozzles";

const GOALS: { key: SprayerApplicationGoal; label: string }[] = [
  { key: "systemic", label: "Systemic" },
  { key: "contact", label: "Contact" },
  { key: "fungicide", label: "Fungicide" },
  { key: "insecticide", label: "Insecticide" },
  { key: "drift", label: "Drift control" },
  { key: "fertiliser", label: "Fertiliser" },
];

export default function NewMachine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [type, setType] = useState<MachineType>("Tractor");
  const [nozzlePickerOpen, setNozzlePickerOpen] = useState(false);
  const [mode, setMode] = useState<SprayerApplicationMode>("broadcast");
  const [goal, setGoal] = useState<SprayerApplicationGoal>("systemic");
  const [pwm, setPwm] = useState(false);
  const [spotWidth, setSpotWidth] = useState("0.5");
  const [treatedPct, setTreatedPct] = useState("10");
  const [f, setF] = useState({
    name: "", make: "", model: "", year: "",
    serial_number: "", registration: "",
    current_hours: "", current_km: "", purchase_date: "", notes: "",
    tank_capacity_l: "", boom_width_m: "", nozzle_spacing_m: "", nozzle_positions: "",
    default_nozzle: "", default_speed_kmh: "", default_water_rate_lha: "",
  });

  const selectedNozzle = NOZZLES.find((n) => n.id === f.default_nozzle) ?? null;
  const isSprayer = type === "Self-propelled sprayer" || type === "Tow-behind sprayer";

  const requiredFlow = useMemo(() => {
    const rate = parseFloat(f.default_water_rate_lha) || 0;
    const speed = parseFloat(f.default_speed_kmh) || 0;
    const width = mode === "spot"
      ? (parseFloat(spotWidth) || 0)
      : (parseFloat(f.nozzle_spacing_m) || 0) / 1000;
    return nozzleFlowLpm(rate, speed, width);
  }, [f.default_water_rate_lha, f.default_speed_kmh, f.nozzle_spacing_m, mode, spotWidth]);

  const recommendations = useMemo(
    () => recommendNozzles(requiredFlow, goal, pwm, mode === "spot", 3),
    [requiredFlow, goal, pwm, mode],
  );

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
      default_application_mode: isSprayer ? mode : undefined,
      default_application_goal: isSprayer ? goal : undefined,
      pwm_enabled: isSprayer ? pwm : false,
      spot_nozzle_width_m: isSprayer && mode === "spot" && spotWidth ? parseFloat(spotWidth) : undefined,
      default_treated_pct: isSprayer && mode === "spot" && treatedPct ? parseFloat(treatedPct) : undefined,
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
                  <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="Manufacturer" value={f.make} onChangeText={(v) => setF({ ...f, make: v })} testID="input-make" />
            <Input label="Model" value={f.model} onChangeText={(v) => setF({ ...f, model: v })} testID="input-model" />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}><Input label="Year" value={f.year} onChangeText={(v) => setF({ ...f, year: v })} keyboardType="numeric" testID="input-year" /></View>
              <View style={{ flex: 1 }}><Input label="Registration" value={f.registration} onChangeText={(v) => setF({ ...f, registration: v })} testID="input-rego" /></View>
            </View>
            <Input label="Serial number" value={f.serial_number} onChangeText={(v) => setF({ ...f, serial_number: v })} testID="input-serial" />
            <View style={styles.twoCol}>
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
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}><Input label="Tank capacity" value={f.tank_capacity_l} onChangeText={(v) => setF({ ...f, tank_capacity_l: v })} keyboardType="decimal-pad" suffix="L" testID="input-tank" /></View>
                  <View style={{ flex: 1 }}><Input label="Boom width" value={f.boom_width_m} onChangeText={(v) => setF({ ...f, boom_width_m: v })} keyboardType="decimal-pad" suffix="m" testID="input-boom" /></View>
                </View>
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}><Input label="Nozzle spacing" value={f.nozzle_spacing_m} onChangeText={(v) => setF({ ...f, nozzle_spacing_m: v })} keyboardType="decimal-pad" suffix="mm" testID="input-spacing" /></View>
                  <View style={{ flex: 1 }}><Input label="Nozzle positions" value={f.nozzle_positions} onChangeText={(v) => setF({ ...f, nozzle_positions: v })} keyboardType="numeric" testID="input-positions" /></View>
                </View>
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}><Input label="Typical speed" value={f.default_speed_kmh} onChangeText={(v) => setF({ ...f, default_speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" testID="input-def-speed" /></View>
                  <View style={{ flex: 1 }}><Input label="Typical water rate" value={f.default_water_rate_lha} onChangeText={(v) => setF({ ...f, default_water_rate_lha: v })} keyboardType="decimal-pad" suffix="L/ha" testID="input-def-water" /></View>
                </View>
              </Card>

              <Text style={styles.section}>Nozzle setup</Text>
              <Card>
                <Text style={styles.label}>Application mode</Text>
                <View style={styles.twoCol}>
                  <Choice label="Broadcast" selected={mode === "broadcast"} onPress={() => setMode("broadcast")} />
                  <Choice label="Spot spraying" selected={mode === "spot"} onPress={() => setMode("spot")} />
                </View>
                {mode === "spot" ? (
                  <>
                    <Input label="Sprayed width per fired nozzle" value={spotWidth} onChangeText={setSpotWidth} keyboardType="decimal-pad" suffix="m" testID="input-spot-width" />
                    <Input label="Typical paddock area treated" value={treatedPct} onChangeText={setTreatedPct} keyboardType="decimal-pad" suffix="%" testID="input-treated-pct" />
                    <Text style={styles.hint}>Spot nozzle sizing uses the water rate on the area actually sprayed and the width of one firing nozzle. Treated % changes average paddock water use, not the nozzle flow while it is ON.</Text>
                  </>
                ) : null}

                <Text style={styles.label}>Main application goal</Text>
                <View style={styles.grid}>
                  {GOALS.map((g) => (
                    <Pressable key={g.key} onPress={() => setGoal(g.key)} style={[styles.chip, goal === g.key && styles.chipActive]} testID={`goal-${g.key}`}>
                      <Text style={[styles.chipText, goal === g.key && styles.chipTextActive]}>{g.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable onPress={() => setPwm((v) => !v)} style={[styles.toggle, pwm && styles.toggleOn]} testID="input-pwm">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>PWM / individual nozzle control</Text>
                    <Text style={styles.hint}>Chaser will favour nozzle families with confirmed PWM suitability.</Text>
                  </View>
                  <Icon name={pwm ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={pwm ? colors.brandPrimary : colors.muted} />
                </Pressable>

                <View style={styles.flowBox}>
                  <Text style={styles.flowLabel}>Required flow per nozzle</Text>
                  <Text style={styles.flowValue}>{requiredFlow.toFixed(2)} L/min</Text>
                  <Text style={styles.hint}>{mode === "spot" ? "while each spot nozzle is firing" : "at the typical rate and speed above"}</Text>
                </View>

                <Text style={styles.pickerLabel}>Chaser recommendations</Text>
                {recommendations.length ? recommendations.map((r, i) => {
                  const active = f.default_nozzle === r.nozzle.id;
                  return (
                    <Pressable key={r.nozzle.id} onPress={() => setF({ ...f, default_nozzle: r.nozzle.id })} style={[styles.recRow, active && styles.recRowActive]} testID={`mach-rec-${r.nozzle.id}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nozzleName}>{i === 0 ? "★ " : ""}{r.nozzle.label}</Text>
                        <Text style={styles.nozzleSub}>~{r.check.requiredPressureBar?.toFixed(1)} bar · {r.nozzle.type}{r.nozzle.pwmApproved ? " · PWM" : ""}</Text>
                        {r.nozzle.dropletRange ? <Text style={styles.nozzleSub}>Droplet range: {r.nozzle.dropletRange}</Text> : null}
                      </View>
                      {active ? <Icon name="check-circle" size={20} color={colors.brandPrimary} /> : <Icon name="chevron-right" size={20} color={colors.muted} />}
                    </Pressable>
                  );
                }) : <Text style={styles.hint}>Enter a typical water rate, speed and {mode === "spot" ? "spot width" : "nozzle spacing"} to get recommendations.</Text>}

                <Text style={styles.pickerLabel}>Manual nozzle selection</Text>
                <Pressable onPress={() => setNozzlePickerOpen((v) => !v)} testID="mach-nozzle-select" style={styles.nozzleBtn}>
                  <Text style={styles.nozzleBtnText} numberOfLines={2}>{selectedNozzle ? selectedNozzle.label : "Choose from full nozzle library"}</Text>
                  <Icon name={nozzlePickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                </Pressable>
                {nozzlePickerOpen ? (
                  <View style={styles.nozzlePickerWrap} testID="mach-nozzle-picker">
                    <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
                      <Pressable onPress={() => { setF({ ...f, default_nozzle: "" }); setNozzlePickerOpen(false); }} style={styles.nozzleRow}><Text style={styles.nozzleClear}>None — clear selection</Text></Pressable>
                      {NOZZLES.map((n) => {
                        const active = f.default_nozzle === n.id;
                        return (
                          <Pressable key={n.id} onPress={() => { setF({ ...f, default_nozzle: n.id }); setNozzlePickerOpen(false); }} style={[styles.nozzleRow, active && { backgroundColor: colors.brandSecondary }]} testID={`mach-nozzle-option-${n.id}`}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.nozzleName}>{n.label}</Text>
                              <Text style={styles.nozzleSub}>{n.type} · {n.minPressureBar}–{n.maxPressureBar} bar{n.pwmApproved ? " · PWM" : ""}</Text>
                            </View>
                            {active ? <Icon name="check" size={18} color={colors.brandPrimary} /> : null}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
                <Text style={styles.disclaimer}>Recommendation aid only. Confirm the current manufacturer nozzle chart, droplet classification and chemical label/permit requirements before application.</Text>
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

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceActive]}><Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: 8, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  twoCol: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  chipTextActive: { color: colors.onBrandPrimary },
  choice: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, marginBottom: spacing.md },
  choiceActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  choiceText: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  choiceTextActive: { color: colors.onBrandPrimary },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 4 },
  toggleOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 11, color: colors.muted, lineHeight: 15, marginTop: 2 },
  flowBox: { alignItems: "center", backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: 14, marginTop: spacing.md },
  flowLabel: { fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase" },
  flowValue: { fontSize: 28, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 2 },
  pickerLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: 14, fontWeight: "800" },
  recRow: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8 },
  recRowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  nozzleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: 12, minHeight: 46, marginBottom: 4, gap: 8 },
  nozzleBtnText: { flex: 1, fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  nozzlePickerWrap: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: 4, padding: 4 },
  nozzleRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.sm, gap: 8 },
  nozzleName: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  nozzleSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  nozzleClear: { fontSize: 12, color: colors.error, fontWeight: "700" },
  disclaimer: { fontSize: 10, color: colors.muted, lineHeight: 14, fontStyle: "italic", marginTop: spacing.md },
});
