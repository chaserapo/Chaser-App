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

type NozzleBodyType = "single" | "tri" | "quad" | "five";

const BODY_TYPES: { key: NozzleBodyType; label: string; count: number }[] = [
  { key: "single", label: "Single", count: 1 },
  { key: "tri", label: "Tri-Jet", count: 3 },
  { key: "quad", label: "Quadri-Jet", count: 4 },
  { key: "five", label: "5-way", count: 5 },
];

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
  const [mode, setMode] = useState<SprayerApplicationMode>("broadcast");
  const [goal, setGoal] = useState<SprayerApplicationGoal>("systemic");
  const [pwm, setPwm] = useState(false);
  const [spotWidth, setSpotWidth] = useState("0.5");
  const [treatedPct, setTreatedPct] = useState("10");
  const [fenceJets, setFenceJets] = useState<0 | 1 | 2>(0);
  const [bodyType, setBodyType] = useState<NozzleBodyType>("single");
  const [bodyNozzles, setBodyNozzles] = useState<string[]>(["", "", "", "", ""]);
  const [defaultPosition, setDefaultPosition] = useState(1);
  const [autoSwitching, setAutoSwitching] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<number | null>(null);
  const [f, setF] = useState({
    name: "", make: "", model: "", year: "",
    serial_number: "", registration: "",
    current_hours: "", current_km: "", purchase_date: "", notes: "",
    tank_capacity_l: "", boom_width_m: "", nozzle_spacing_m: "", nozzle_positions: "",
    default_speed_kmh: "", default_water_rate_lha: "",
  });

  const isSprayer = type === "Self-propelled sprayer" || type === "Tow-behind sprayer";
  const bodyCount = BODY_TYPES.find((x) => x.key === bodyType)?.count ?? 1;

  // Auto-fill "# of nozzles" from boom width ÷ nozzle spacing, plus however
  // many fence jets are ticked - those sit at the boom ends outside the
  // regular spacing pattern. Still a plain editable field afterwards.
  function recomputeNozzleCount(boomStr: string, spacingStr: string, fj: 0 | 1 | 2) {
    const boomM = parseFloat(boomStr);
    const spacingMm = parseFloat(spacingStr);
    if (!boomM || !spacingMm) return;
    const mainCount = Math.round(boomM / (spacingMm / 1000));
    setF((prev) => ({ ...prev, nozzle_positions: String(mainCount + fj) }));
  }
  const activeNozzleId = bodyNozzles[Math.max(0, defaultPosition - 1)] || "";
  const activeNozzle = NOZZLES.find((n) => n.id === activeNozzleId) ?? null;

  const requiredFlow = useMemo(() => {
    const rate = parseFloat(f.default_water_rate_lha) || 0;
    const speed = parseFloat(f.default_speed_kmh) || 0;
    const width = mode === "spot" ? (parseFloat(spotWidth) || 0) : (parseFloat(f.nozzle_spacing_m) || 0) / 1000;
    return nozzleFlowLpm(rate, speed, width);
  }, [f.default_water_rate_lha, f.default_speed_kmh, f.nozzle_spacing_m, mode, spotWidth]);

  const recommendations = useMemo(
    () => recommendNozzles(requiredFlow, goal, pwm, mode === "spot", 5),
    [requiredFlow, goal, pwm, mode],
  );

  const fittedRecommendations = useMemo(() => {
    return bodyNozzles.slice(0, bodyCount)
      .map((id, index) => {
        const nozzle = NOZZLES.find((n) => n.id === id);
        if (!nozzle || requiredFlow <= 0) return null;
        const match = recommendNozzles(requiredFlow, goal, pwm, mode === "spot", NOZZLES.length).find((r) => r.nozzle.id === id);
        return match ? { ...match, position: index + 1 } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score) as any[];
  }, [bodyNozzles, bodyCount, requiredFlow, goal, pwm, mode]);

  function setBody(type_: NozzleBodyType) {
    setBodyType(type_);
    const count = BODY_TYPES.find((x) => x.key === type_)?.count ?? 1;
    if (defaultPosition > count) setDefaultPosition(1);
    if (type_ === "single") setAutoSwitching(false);
  }

  function chooseNozzle(position: number, nozzleId: string) {
    setBodyNozzles((prev) => {
      const next = [...prev];
      next[position - 1] = nozzleId;
      return next;
    });
    setPickerPosition(null);
  }

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !f.name.trim()) return;
    const selectedDefault = NOZZLES.find((n) => n.id === activeNozzleId);
    const m: Machinery = {
      id: uuid(), business_id: business.id, name: f.name.trim(), machine_type: type,
      make: f.make || undefined, model: f.model || undefined, year: f.year ? parseInt(f.year) : undefined,
      serial_number: f.serial_number || undefined, registration: f.registration || undefined,
      current_hours: f.current_hours ? parseFloat(f.current_hours) : undefined,
      current_km: f.current_km ? parseFloat(f.current_km) : undefined,
      purchase_date: f.purchase_date || undefined, notes: f.notes || undefined,
      tank_capacity_l: isSprayer && f.tank_capacity_l ? parseFloat(f.tank_capacity_l) : undefined,
      boom_width_m: isSprayer && f.boom_width_m ? parseFloat(f.boom_width_m) : undefined,
      nozzle_spacing_m: isSprayer && f.nozzle_spacing_m ? parseFloat(f.nozzle_spacing_m) / 1000 : undefined,
      nozzle_positions: isSprayer && f.nozzle_positions ? parseInt(f.nozzle_positions) : undefined,
      default_nozzle: isSprayer ? (selectedDefault?.label || undefined) : undefined,
      default_speed_kmh: isSprayer && f.default_speed_kmh ? parseFloat(f.default_speed_kmh) : undefined,
      default_water_rate_lha: isSprayer && f.default_water_rate_lha ? parseFloat(f.default_water_rate_lha) : undefined,
      default_application_mode: isSprayer ? mode : undefined,
      default_application_goal: isSprayer ? goal : undefined,
      pwm_enabled: isSprayer ? pwm : false,
      spot_nozzle_width_m: isSprayer && mode === "spot" && spotWidth ? parseFloat(spotWidth) : undefined,
      default_treated_pct: isSprayer && mode === "spot" && treatedPct ? parseFloat(treatedPct) : undefined,
      created_at: new Date().toISOString(),
    };
    if (isSprayer) {
      Object.assign(m as any, {
        nozzle_body_type: bodyType,
        nozzle_body_positions: bodyNozzles.slice(0, bodyCount).map((nozzle_id, i) => ({ position: i + 1, nozzle_id: nozzle_id || null })),
        default_nozzle_position: defaultPosition,
        automatic_nozzle_switching: bodyType !== "single" ? autoSwitching : false,
      });
    }
    await repo.machinery.save(m);
    router.replace({ pathname: "/machinery/[id]", params: { id: m.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Machine" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Machine name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Text style={styles.label}>Type</Text>
            <View style={styles.grid}>{MACHINE_TYPES.map((t) => <Pressable key={t} onPress={() => setType(t)} style={[styles.chip, type === t && styles.chipActive]}><Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text></Pressable>)}</View>
            <Input label="Manufacturer" value={f.make} onChangeText={(v) => setF({ ...f, make: v })} />
            <Input label="Model" value={f.model} onChangeText={(v) => setF({ ...f, model: v })} />
            <View style={styles.twoCol}><View style={{ flex: 1 }}><Input label="Year" value={f.year} onChangeText={(v) => setF({ ...f, year: v })} keyboardType="numeric" /></View><View style={{ flex: 1 }}><Input label="Registration" value={f.registration} onChangeText={(v) => setF({ ...f, registration: v })} /></View></View>
            <Input label="Serial number" value={f.serial_number} onChangeText={(v) => setF({ ...f, serial_number: v })} />
            <View style={styles.twoCol}><View style={{ flex: 1 }}><Input label="Current hours" value={f.current_hours} onChangeText={(v) => setF({ ...f, current_hours: v })} keyboardType="decimal-pad" suffix="h" /></View><View style={{ flex: 1 }}><Input label="Current km" value={f.current_km} onChangeText={(v) => setF({ ...f, current_km: v })} keyboardType="decimal-pad" suffix="km" /></View></View>
            <Input label="Purchase date (YYYY-MM-DD)" value={f.purchase_date} onChangeText={(v) => setF({ ...f, purchase_date: v })} />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline />
          </Card>

          {isSprayer ? <>
            <Text style={styles.section}>Sprayer setup</Text>
            <Card>
              <View style={styles.twoCol}><View style={{ flex: 1 }}><Input label="Tank capacity" value={f.tank_capacity_l} onChangeText={(v) => setF({ ...f, tank_capacity_l: v })} keyboardType="decimal-pad" suffix="L" /></View><View style={{ flex: 1 }}><Input label="Boom width" value={f.boom_width_m} onChangeText={(v) => { setF({ ...f, boom_width_m: v }); recomputeNozzleCount(v, f.nozzle_spacing_m, fenceJets); }} keyboardType="decimal-pad" suffix="m" /></View></View>
              <View style={styles.twoCol}><View style={{ flex: 1 }}><Input label="Nozzle spacing" value={f.nozzle_spacing_m} onChangeText={(v) => { setF({ ...f, nozzle_spacing_m: v }); recomputeNozzleCount(f.boom_width_m, v, fenceJets); }} keyboardType="decimal-pad" suffix="mm" /></View><View style={{ flex: 1 }}><Input label="# of nozzles" value={f.nozzle_positions} onChangeText={(v) => setF({ ...f, nozzle_positions: v })} keyboardType="numeric" /></View></View>
              <Text style={styles.label}>Fence jet nozzles</Text>
              <View style={styles.twoColThree}>{([0, 1, 2] as const).map((n) => <Pressable key={n} onPress={() => { setFenceJets(n); recomputeNozzleCount(f.boom_width_m, f.nozzle_spacing_m, n); }} style={[styles.chip, styles.thirdChip, fenceJets === n && styles.chipActive]} testID={`fence-jets-${n}`}><Text style={[styles.chipText, fenceJets === n && styles.chipTextActive]}>{n}</Text></Pressable>)}</View>
              <Text style={styles.hint}>Fence jets sit at the boom ends spraying outward, outside the regular nozzle spacing. "# of nozzles" auto-fills from boom width ÷ spacing + fence jets - edit it directly if it doesn't match your setup.</Text>
              <View style={styles.twoCol}><View style={{ flex: 1 }}><Input label="Typical speed" value={f.default_speed_kmh} onChangeText={(v) => setF({ ...f, default_speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" /></View><View style={{ flex: 1 }}><Input label="Typical water rate" value={f.default_water_rate_lha} onChangeText={(v) => setF({ ...f, default_water_rate_lha: v })} keyboardType="decimal-pad" suffix="L/ha" /></View></View>
            </Card>

            <Text style={styles.section}>Nozzle body</Text>
            <Card>
              <Text style={styles.label}>Body / turret type</Text>
              <View style={styles.grid}>{BODY_TYPES.map((b) => <Pressable key={b.key} onPress={() => setBody(b.key)} style={[styles.chip, bodyType === b.key && styles.chipActive]} testID={`body-${b.key}`}><Text style={[styles.chipText, bodyType === b.key && styles.chipTextActive]}>{b.label}</Text></Pressable>)}</View>
              <Text style={styles.hint}>Tri-Jet, Quadri-Jet and 5-way bodies store alternate tips fitted at each outlet. Only the selected position is treated as active unless the sprayer supports automatic switching.</Text>

              {Array.from({ length: bodyCount }, (_, i) => i + 1).map((position) => {
                const id = bodyNozzles[position - 1];
                const nozzle = NOZZLES.find((n) => n.id === id);
                const open = pickerPosition === position;
                return <View key={position} style={styles.positionBlock}>
                  <View style={styles.positionHeader}><Text style={styles.positionTitle}>Position {position}{defaultPosition === position ? " · DEFAULT" : ""}</Text><Pressable onPress={() => setDefaultPosition(position)}><Text style={styles.makeDefault}>{defaultPosition === position ? "Active default" : "Make default"}</Text></Pressable></View>
                  <Pressable onPress={() => setPickerPosition(open ? null : position)} style={styles.nozzleBtn} testID={`position-${position}-select`}><Text style={styles.nozzleBtnText}>{nozzle?.label ?? "Select fitted nozzle"}</Text><Icon name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} /></Pressable>
                  {open ? <View style={styles.nozzlePickerWrap}><ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>{NOZZLES.map((n) => <Pressable key={`${position}-${n.id}`} onPress={() => chooseNozzle(position, n.id)} style={[styles.nozzleRow, id === n.id && { backgroundColor: colors.brandSecondary }]}><View style={{ flex: 1 }}><Text style={styles.nozzleName}>{n.label}</Text><Text style={styles.nozzleSub}>{n.type} · {n.minPressureBar}–{n.maxPressureBar} bar{n.pwmApproved ? " · PWM" : ""}</Text></View>{id === n.id ? <Icon name="check" size={18} color={colors.brandPrimary} /> : null}</Pressable>)}</ScrollView></View> : null}
                </View>;
              })}

              {bodyType !== "single" ? <Pressable onPress={() => setAutoSwitching((v) => !v)} style={[styles.toggle, autoSwitching && styles.toggleOn]}><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>Automatic nozzle switching</Text><Text style={styles.hint}>Enable for systems that can change active nozzle positions automatically. Leave off for manual rotary bodies.</Text></View><Icon name={autoSwitching ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={autoSwitching ? colors.brandPrimary : colors.muted} /></Pressable> : null}
            </Card>

            <Text style={styles.section}>Application setup</Text>
            <Card>
              <Text style={styles.label}>Application mode</Text><View style={styles.twoCol}><Choice label="Broadcast" selected={mode === "broadcast"} onPress={() => setMode("broadcast")} /><Choice label="Spot spraying" selected={mode === "spot"} onPress={() => setMode("spot")} /></View>
              {mode === "spot" ? <><Input label="Sprayed width per fired nozzle" value={spotWidth} onChangeText={setSpotWidth} keyboardType="decimal-pad" suffix="m" /><Input label="Typical paddock area treated" value={treatedPct} onChangeText={setTreatedPct} keyboardType="decimal-pad" suffix="%" /><Text style={styles.hint}>Spot nozzle sizing uses the rate on the area actually sprayed. Treated % only changes average paddock use.</Text></> : null}
              <Text style={styles.label}>Main application goal</Text><View style={styles.grid}>{GOALS.map((g) => <Pressable key={g.key} onPress={() => setGoal(g.key)} style={[styles.chip, goal === g.key && styles.chipActive]}><Text style={[styles.chipText, goal === g.key && styles.chipTextActive]}>{g.label}</Text></Pressable>)}</View>
              <Pressable onPress={() => setPwm((v) => !v)} style={[styles.toggle, pwm && styles.toggleOn]}><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>PWM / individual nozzle control</Text><Text style={styles.hint}>Used when ranking nozzle suitability.</Text></View><Icon name={pwm ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={pwm ? colors.brandPrimary : colors.muted} /></Pressable>
              <View style={styles.flowBox}><Text style={styles.flowLabel}>Required flow per active nozzle</Text><Text style={styles.flowValue}>{requiredFlow.toFixed(2)} L/min</Text></View>

              {fittedRecommendations.length > 0 ? <><Text style={styles.pickerLabel}>Best nozzle already fitted</Text>{fittedRecommendations.slice(0, 3).map((r: any, i) => <Pressable key={`fit-${r.position}`} onPress={() => setDefaultPosition(r.position)} style={[styles.recRow, defaultPosition === r.position && styles.recRowActive]}><View style={{ flex: 1 }}><Text style={styles.nozzleName}>{i === 0 ? "★ " : ""}Position {r.position} · {r.nozzle.label}</Text><Text style={styles.nozzleSub}>~{r.check.requiredPressureBar?.toFixed(1)} bar · {r.nozzle.type}</Text></View><Text style={styles.positionBadge}>P{r.position}</Text></Pressable>)}</> : <><Text style={styles.pickerLabel}>Chaser recommendations</Text>{recommendations.slice(0, 3).map((r, i) => <View key={r.nozzle.id} style={styles.recRow}><View style={{ flex: 1 }}><Text style={styles.nozzleName}>{i === 0 ? "★ " : ""}{r.nozzle.label}</Text><Text style={styles.nozzleSub}>~{r.check.requiredPressureBar?.toFixed(1)} bar · {r.nozzle.type}</Text></View></View>)}</>}
              {activeNozzle ? <Text style={styles.activeSummary}>Default active position: {defaultPosition} · {activeNozzle.label}</Text> : null}
              <Text style={styles.disclaimer}>Recommendation aid only. Confirm current manufacturer charts, droplet classification and chemical label/permit requirements before application.</Text>
            </Card>
          </> : null}

          <View style={{ height: spacing.md }} /><Button title="Save Machine" icon="content-save-outline" onPress={save} disabled={!f.name.trim()} />
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
  twoColThree: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  thirdChip: { flex: 1 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary }, chipTextActive: { color: colors.onBrandPrimary },
  choice: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, marginBottom: spacing.md },
  choiceActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }, choiceText: { fontSize: 13, fontWeight: "800", color: colors.onSurface }, choiceTextActive: { color: colors.onBrandPrimary },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 10 }, toggleOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary }, toggleTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 11, color: colors.muted, lineHeight: 15, marginTop: 2 },
  flowBox: { alignItems: "center", backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: 14, marginTop: spacing.md }, flowLabel: { fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase" }, flowValue: { fontSize: 28, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 2 },
  pickerLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, marginTop: 14, fontWeight: "800" },
  recRow: { flexDirection: "row", alignItems: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 8 }, recRowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  nozzleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm, paddingHorizontal: 12, minHeight: 46, gap: 8 }, nozzleBtnText: { flex: 1, fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  nozzlePickerWrap: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, marginTop: 4, padding: 4 }, nozzleRow: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: radius.sm, gap: 8 }, nozzleName: { fontSize: 13, fontWeight: "700", color: colors.onSurface }, nozzleSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  positionBlock: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider }, positionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }, positionTitle: { fontSize: 12, fontWeight: "800", color: colors.onSurface }, makeDefault: { fontSize: 11, fontWeight: "800", color: colors.brandPrimary }, positionBadge: { fontSize: 12, fontWeight: "900", color: colors.brandPrimary },
  activeSummary: { fontSize: 12, fontWeight: "800", color: colors.onBrandSecondary, backgroundColor: colors.brandSecondary, padding: 10, borderRadius: radius.sm, marginTop: 8 },
  disclaimer: { fontSize: 10, color: colors.muted, lineHeight: 14, fontStyle: "italic", marginTop: spacing.md },
});