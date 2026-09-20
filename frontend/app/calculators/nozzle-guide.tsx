import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { nozzleFlowLpm, fmt } from "@/src/lib/calculators";
import { NOZZLES, recommendNozzles, checkNozzle, type ApplicationGoal } from "@/src/lib/nozzles";

type Mode = "broadcast" | "spot";
type SpotRateMode = "lha" | "per100l";

const GOALS: { key: ApplicationGoal; label: string; icon: string }[] = [
  { key: "systemic", label: "Systemic herbicide", icon: "sprout-outline" },
  { key: "contact", label: "Contact herbicide", icon: "leaf" },
  { key: "fungicide", label: "Fungicide", icon: "shield-flower-outline" },
  { key: "insecticide", label: "Insecticide", icon: "bug-outline" },
  { key: "drift", label: "Drift control", icon: "weather-windy" },
  { key: "fertiliser", label: "Liquid fertiliser", icon: "water-outline" },
];

const SWATCH: Record<string, string> = {
  Orange: "#F97316", Green: "#4ADE80", Yellow: "#FDE047", Lilac: "#C084FC",
  Blue: "#60A5FA", Red: "#F87171", Brown: "#B45309", Grey: "#9CA3AF",
  White: "#F3F4F6", "Light blue": "#7DD3FC",
};

export default function NozzleGuide() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("broadcast");
  const [goal, setGoal] = useState<ApplicationGoal>("systemic");
  const [rate, setRate] = useState("80");
  const [speed, setSpeed] = useState("18");
  const [spacing_, setSpacing] = useState("0.5");
  const [spotWidth, setSpotWidth] = useState("0.5");
  const [treatedPct, setTreatedPct] = useState("10");
  const [pwm, setPwm] = useState(false);
  const [spotRateMode, setSpotRateMode] = useState<SpotRateMode>("lha");
  const [spotConcentration, setSpotConcentration] = useState("1");
  const [showManual, setShowManual] = useState(false);

  const targetRate = Math.max(0, parseFloat(rate) || 0);
  const travelSpeed = Math.max(0, parseFloat(speed) || 0);
  const effectiveWidth = mode === "spot" ? Math.max(0, parseFloat(spotWidth) || 0) : Math.max(0, parseFloat(spacing_) || 0);
  const treatedFraction = Math.min(1, Math.max(0, (parseFloat(treatedPct) || 0) / 100));
  const required = useMemo(() => nozzleFlowLpm(targetRate, travelSpeed, effectiveWidth), [targetRate, travelSpeed, effectiveWidth]);
  const recommended = useMemo(() => recommendNozzles(required, goal, pwm, mode === "spot", 5), [required, goal, pwm, mode]);
  const manual = useMemo(() => NOZZLES.map((n) => ({ nozzle: n, check: checkNozzle(n, required) })).sort((a, b) => Math.abs((a.check.requiredPressureBar ?? 99) - 3) - Math.abs((b.check.requiredPressureBar ?? 99) - 3)), [required]);

  const wholePaddockWaterRate = mode === "spot" ? targetRate * treatedFraction : targetRate;
  const spotProductPerSprayedHa = mode === "spot" && spotRateMode === "per100l" ? ((parseFloat(spotConcentration) || 0) * targetRate) / 100 : null;
  const spotProductPerPaddockHa = spotProductPerSprayedHa == null ? null : spotProductPerSprayedHa * treatedFraction;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Nozzle Selector" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Application mode</Text>
          <View style={styles.twoCol}>
            <Choice label="Broadcast" selected={mode === "broadcast"} onPress={() => setMode("broadcast")} />
            <Choice label="Spot spraying" selected={mode === "spot"} onPress={() => setMode("spot")} />
          </View>

          <Text style={styles.section}>What are you trying to achieve?</Text>
          <View style={styles.goalGrid}>
            {GOALS.map((g) => <Pressable key={g.key} onPress={() => setGoal(g.key)} style={[styles.goalBtn, goal === g.key && styles.goalBtnOn]}><Icon name={g.icon as any} size={19} color={goal === g.key ? colors.onBrandPrimary : colors.brandPrimary} /><Text style={[styles.goalText, goal === g.key && styles.goalTextOn]}>{g.label}</Text></Pressable>)}
          </View>

          <Text style={styles.section}>Spray setup</Text>
          <Card>
            <Input label={mode === "spot" ? "Water rate on sprayed area" : "Application rate"} value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="L/ha" />
            <Input label="Speed" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" suffix="km/h" />
            {mode === "broadcast" ? <Input label="Nozzle spacing" value={spacing_} onChangeText={setSpacing} keyboardType="decimal-pad" suffix="m" /> : <>
              <Input label="Sprayed width per fired nozzle" value={spotWidth} onChangeText={setSpotWidth} keyboardType="decimal-pad" suffix="m" />
              <Input label="Estimated paddock area treated" value={treatedPct} onChangeText={setTreatedPct} keyboardType="decimal-pad" suffix="%" />
              <Text style={styles.hint}>Spot nozzle flow is sized from the L/ha delivered to the area actually sprayed and the sprayed width of one firing nozzle. The treated percentage changes average paddock use, not nozzle flow while ON.</Text>
            </>}
          </Card>

          {mode === "spot" ? <>
            <Text style={styles.section}>Spot-rate method</Text>
            <View style={styles.twoCol}>
              <Choice label="Normal L/ha" selected={spotRateMode === "lha"} onPress={() => setSpotRateMode("lha")} />
              <Choice label="Label L/100 L" selected={spotRateMode === "per100l"} onPress={() => setSpotRateMode("per100l")} />
            </View>
            {spotRateMode === "per100l" ? <Card><Input label="Label spot concentration" value={spotConcentration} onChangeText={setSpotConcentration} keyboardType="decimal-pad" suffix="L/100 L" /><Text style={styles.hint}>Use only where the product label or APVMA permit specifically provides a spot-spray concentration.</Text></Card> : null}
          </> : null}

          <Text style={styles.section}>Control system</Text>
          <Pressable onPress={() => setPwm((v) => !v)} style={[styles.toggle, pwm && styles.toggleOn]}><View style={{ flex: 1 }}><Text style={styles.toggleTitle}>PWM / individual nozzle control</Text><Text style={styles.hint}>PWM-approved families receive preference in recommendations.</Text></View><Icon name={pwm ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={pwm ? colors.brandPrimary : colors.muted} /></Pressable>

          <View style={{ height: spacing.lg }} />
          <Card style={styles.resultCard}>
            <Text style={styles.resultLabel}>Required flow per firing nozzle</Text>
            <Text style={styles.resultValue}>{fmt(required)} L/min</Text>
            <Text style={styles.resultSub}>{targetRate} L/ha · {travelSpeed} km/h · {fmt(effectiveWidth, 2)} m effective width</Text>
            {mode === "spot" ? <View style={{ marginTop: 12 }}><Summary label="Sprayed-area water rate" value={`${fmt(targetRate, 1)} L/ha`} /><Summary label="Whole-paddock average" value={`${fmt(wholePaddockWaterRate, 1)} L/ha`} /><Summary label="Area treated" value={`${fmt(treatedFraction * 100, 1)}%`} />{spotProductPerSprayedHa != null ? <Summary label="Product / sprayed ha" value={`${fmt(spotProductPerSprayedHa, 2)} L/ha`} /> : null}{spotProductPerPaddockHa != null ? <Summary label="Avg product / paddock ha" value={`${fmt(spotProductPerPaddockHa, 2)} L/ha`} /> : null}</View> : null}
          </Card>

          <Text style={styles.section}>Recommended</Text>
          {recommended.length ? recommended.map((r, i) => <Card key={r.nozzle.id} style={[styles.recCard, i === 0 && styles.recTop]}><View style={styles.row}><View style={[styles.swatch, { backgroundColor: SWATCH[r.nozzle.colour] ?? colors.surfaceTertiary }]} /><View style={{ flex: 1 }}><Text style={styles.nozzleName}>{i === 0 ? "★ " : ""}{r.nozzle.label}</Text><Text style={styles.nozzleMeta}>Target pressure ~{fmt(r.check.requiredPressureBar ?? 0, 2)} bar · {r.nozzle.minPressureBar}–{r.nozzle.maxPressureBar} bar family range</Text><Text style={styles.nozzleMeta}>{r.nozzle.type}{r.nozzle.pwmApproved ? " · PWM approved" : ""}</Text>{r.nozzle.dropletRange ? <Text style={styles.nozzleMeta}>Droplet range: {r.nozzle.dropletRange}</Text> : null}</View></View></Card>) : <Card><Text style={styles.hint}>Enter a valid rate, speed and width to see recommendations.</Text></Card>}

          <Pressable onPress={() => setShowManual((v) => !v)} style={styles.manualToggle}><Icon name="format-list-bulleted" size={20} color={colors.brandPrimary} /><Text style={styles.manualText}>{showManual ? "Hide full nozzle library" : `Browse full nozzle library (${NOZZLES.length})`}</Text><Icon name={showManual ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} /></Pressable>
          {showManual ? manual.map((r) => <Card key={r.nozzle.id} style={{ marginBottom: 8 }}><Text style={styles.nozzleName}>{r.nozzle.label}</Text><Text style={styles.nozzleMeta}>{r.nozzle.type} · {r.nozzle.minPressureBar}–{r.nozzle.maxPressureBar} bar · {r.check.requiredPressureBar ? `${fmt(r.check.requiredPressureBar, 2)} bar required` : "enter setup"}</Text></Card>) : null}

          <Text style={styles.disclaimer}>Chaser is a selection aid, not a chemical-label authority. Always confirm the current manufacturer chart, droplet classification, pressure limits and product label/permit requirements before spraying.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}><Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text></Pressable>; }
function Summary({ label, value }: { label: string; value: string }) { return <View style={styles.summary}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  twoCol: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary, marginBottom: 8 },
  choiceOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  choiceText: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  choiceTextOn: { color: colors.onBrandPrimary },
  goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goalBtn: { width: "48%", minHeight: 58, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, alignItems: "center", justifyContent: "center", gap: 4 },
  goalBtnOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  goalText: { fontSize: 11, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  goalTextOn: { color: colors.onBrandPrimary },
  toggle: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12 },
  toggleOn: { backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary },
  toggleTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  hint: { fontSize: 11, color: colors.muted, lineHeight: 15, marginTop: 4 },
  resultCard: { backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary, padding: spacing.xl },
  resultLabel: { textAlign: "center", fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase" },
  resultValue: { textAlign: "center", fontSize: 38, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 3 },
  resultSub: { textAlign: "center", fontSize: 11, color: colors.onBrandSecondary, marginTop: 3 },
  summary: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  summaryLabel: { fontSize: 11, color: colors.onBrandSecondary },
  summaryValue: { fontSize: 11, fontWeight: "800", color: colors.onBrandSecondary },
  recCard: { marginBottom: 8 },
  recTop: { borderWidth: 2, borderColor: colors.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  swatch: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  nozzleName: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  nozzleMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  manualToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.lg, padding: 12, borderRadius: radius.md, backgroundColor: colors.brandSecondary },
  manualText: { flex: 1, fontSize: 13, color: colors.brandPrimary, fontWeight: "800" },
  disclaimer: { fontSize: 10, color: colors.muted, textAlign: "center", lineHeight: 14, fontStyle: "italic", marginTop: spacing.lg, paddingHorizontal: 12 },
});
