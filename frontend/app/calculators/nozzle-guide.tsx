import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { nozzleFlowLpm, fmt } from "@/src/lib/calculators";
import { NOZZLES, checkNozzle, type Nozzle } from "@/src/lib/nozzles";

type ApplicationMode = "broadcast" | "spot";
type Goal = "systemic" | "contact" | "fungicide" | "insecticide" | "drift" | "fertiliser";
type SpotRateMode = "lha" | "per100l";

const GOALS: { key: Goal; label: string; icon: string; help: string }[] = [
  { key: "systemic", label: "Systemic herbicide", icon: "sprout-outline", help: "Prioritise drift control while keeping useful coverage." },
  { key: "contact", label: "Contact herbicide", icon: "leaf", help: "Prioritise coverage and target contact." },
  { key: "fungicide", label: "Fungicide", icon: "shield-flower-outline", help: "Prioritise canopy coverage and penetration." },
  { key: "insecticide", label: "Insecticide", icon: "bug-outline", help: "Prioritise target coverage and penetration." },
  { key: "drift", label: "Maximum drift control", icon: "weather-windy", help: "Favour air-induction and drift-reduction nozzle families." },
  { key: "fertiliser", label: "Liquid fertiliser", icon: "water-outline", help: "Size primarily for flow; confirm fertiliser-compatible nozzle/material." },
];

const SWATCH: Record<string, string> = {
  Orange: "#F97316",
  Green: "#4ADE80",
  Yellow: "#FDE047",
  Lilac: "#C084FC",
  Blue: "#60A5FA",
  Red: "#F87171",
  Brown: "#B45309",
  Grey: "#9CA3AF",
  White: "#F3F4F6",
};

function familyName(n: Nozzle) {
  const bits = n.label.replace(/\s*\([^)]*\)\s*$/, "").split(" ");
  return bits.slice(0, -1).join(" ");
}

function nozzleTraitScore(n: Nozzle, goal: Goal, pwm: boolean, spot: boolean) {
  const t = n.type.toLowerCase();
  const id = n.id.toLowerCase();
  let score = 0;

  if (goal === "drift" || goal === "systemic") {
    if (t.includes("air-induction")) score += 5;
    if (t.includes("drift")) score += 5;
  }
  if (goal === "contact" || goal === "fungicide" || goal === "insecticide") {
    if (t.includes("flat fan")) score += 5;
    if (t.includes("turbotee")) score += 4;
    if (t.includes("air-induction")) score -= 1;
  }
  if (goal === "fertiliser") score += 1;

  // TeeJet Turbo TeeJet is explicitly PWM approved. Other families are not
  // promoted as PWM-compatible here unless we have manufacturer confirmation.
  if (pwm && id.includes("teejet-tt-")) score += 6;
  if (pwm && !id.includes("teejet-tt-")) score -= 1;

  // Target-selectable spot systems usually benefit from good drift control,
  // unless the user has explicitly chosen a coverage-heavy contact goal.
  if (spot && !["contact", "fungicide", "insecticide"].includes(goal)) {
    if (t.includes("air-induction") || t.includes("drift")) score += 2;
  }
  return score;
}

export default function NozzleGuide() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ApplicationMode>("broadcast");
  const [goal, setGoal] = useState<Goal>("systemic");
  const [rate, setRate] = useState("80");
  const [speed, setSpeed] = useState("18");
  const [spacing_, setSpacing] = useState("0.5");
  const [spotWidth, setSpotWidth] = useState("0.5");
  const [treatedPct, setTreatedPct] = useState("10");
  const [spotRateMode, setSpotRateMode] = useState<SpotRateMode>("lha");
  const [spotConcentration, setSpotConcentration] = useState("1");
  const [pwm, setPwm] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const targetRate = Math.max(0, parseFloat(rate) || 0);
  const travelSpeed = Math.max(0, parseFloat(speed) || 0);
  const effectiveWidth = mode === "spot"
    ? Math.max(0, parseFloat(spotWidth) || 0)
    : Math.max(0, parseFloat(spacing_) || 0);
  const treatedFraction = Math.min(1, Math.max(0, (parseFloat(treatedPct) || 0) / 100));

  // For spot spraying, nozzle sizing is based on the water rate delivered to
  // the area that is actually sprayed and the effective sprayed width of one
  // firing nozzle — not the whole-paddock treated percentage.
  const required = useMemo(
    () => nozzleFlowLpm(targetRate, travelSpeed, effectiveWidth),
    [targetRate, travelSpeed, effectiveWidth],
  );

  const wholePaddockWaterRate = mode === "spot" ? targetRate * treatedFraction : targetRate;
  const spotProductPerSprayedHa = mode === "spot" && spotRateMode === "per100l"
    ? ((parseFloat(spotConcentration) || 0) * targetRate) / 100
    : null;
  const spotProductPerPaddockHa = spotProductPerSprayedHa == null ? null : spotProductPerSprayedHa * treatedFraction;

  const ranked = useMemo(() => {
    if (required <= 0) return [];
    return NOZZLES.map((n) => {
      const check = checkNozzle(n, required);
      const pressure = check.requiredPressureBar;
      const inRange = pressure != null && pressure >= n.minPressureBar && pressure <= n.maxPressureBar;
      const pressurePenalty = pressure == null ? 100 : Math.abs(pressure - 3) * 1.4;
      const rangePenalty = inRange ? 0 : 40;
      const trait = nozzleTraitScore(n, goal, pwm, mode === "spot");
      const score = trait * 5 - pressurePenalty - rangePenalty;
      return { nozzle: n, check, score, inRange };
    })
      .sort((a, b) => b.score - a.score)
      .filter((x) => x.check.requiredPressureBar != null);
  }, [required, goal, pwm, mode]);

  const recommended = ranked.filter((x) => x.inRange).slice(0, 3);
  const selectedGoal = GOALS.find((g) => g.key === goal)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Nozzle Selector" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Text style={styles.section}>Application mode</Text>
          <View style={styles.segmentRow}>
            <Choice label="Broadcast" selected={mode === "broadcast"} onPress={() => setMode("broadcast")} icon="spray" />
            <Choice label="Spot spraying" selected={mode === "spot"} onPress={() => setMode("spot")} icon="target" />
          </View>

          <Text style={styles.section}>What are you trying to achieve?</Text>
          <View style={styles.goalGrid}>
            {GOALS.map((g) => (
              <Pressable key={g.key} onPress={() => setGoal(g.key)} style={[styles.goalBtn, goal === g.key && styles.goalBtnOn]} testID={`ng-goal-${g.key}`}>
                <Icon name={g.icon as any} size={20} color={goal === g.key ? colors.onBrandPrimary : colors.brandPrimary} />
                <Text style={[styles.goalText, goal === g.key && styles.goalTextOn]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>{selectedGoal.help}</Text>

          <Text style={styles.section}>Spray setup</Text>
          <Card>
            <Input label={mode === "spot" ? "Water rate on sprayed area" : "Application rate"} value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="L/ha" testID="ng-rate" />
            <Input label="Speed" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" suffix="km/h" testID="ng-speed" />
            {mode === "broadcast" ? (
              <Input label="Nozzle spacing" value={spacing_} onChangeText={setSpacing} keyboardType="decimal-pad" suffix="m" testID="ng-spacing" />
            ) : (
              <>
                <Input label="Sprayed width per fired nozzle" value={spotWidth} onChangeText={setSpotWidth} keyboardType="decimal-pad" suffix="m" testID="ng-spot-width" />
                <Text style={styles.inlineHint}>Use the actual sprayed width of a single nozzle at your normal boom height, speed and pressure. Spot systems cannot assume broadcast pattern overlap.</Text>
                <Input label="Estimated paddock area treated" value={treatedPct} onChangeText={setTreatedPct} keyboardType="decimal-pad" suffix="%" testID="ng-treated-pct" />
              </>
            )}
          </Card>

          {mode === "spot" ? (
            <>
              <Text style={styles.section}>Spot-rate method</Text>
              <View style={styles.segmentRow}>
                <Choice label="L/ha rate" selected={spotRateMode === "lha"} onPress={() => setSpotRateMode("lha")} icon="ruler-square" />
                <Choice label="Label L/100 L" selected={spotRateMode === "per100l"} onPress={() => setSpotRateMode("per100l")} icon="flask-outline" />
              </View>
              {spotRateMode === "per100l" ? (
                <Card style={{ marginTop: spacing.sm }}>
                  <Input label="Label spot-spray concentration" value={spotConcentration} onChangeText={setSpotConcentration} keyboardType="decimal-pad" suffix="L/100 L" testID="ng-spot-concentration" />
                  <Text style={styles.inlineHint}>Only use this method where the product label or an APVMA permit specifically provides a spot-spray concentration.</Text>
                </Card>
              ) : (
                <Text style={styles.help}>Use the product's normal L/ha rate over the area actually sprayed unless the label/permit gives a specific spot-spray concentration.</Text>
              )}
            </>
          ) : null}

          <Text style={styles.section}>Control system</Text>
          <Pressable onPress={() => setPwm((v) => !v)} style={[styles.toggleCard, pwm && styles.toggleCardOn]} testID="ng-pwm">
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>PWM / individual nozzle control</Text>
              <Text style={styles.toggleSub}>Helps Chaser favour nozzle families with confirmed PWM suitability.</Text>
            </View>
            <Icon name={pwm ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={pwm ? colors.brandPrimary : colors.muted} />
          </Pressable>

          <View style={{ height: spacing.lg }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary, padding: spacing.xl }}>
            <Text style={styles.reqLabel}>Required flow per firing nozzle</Text>
            <Text style={styles.reqValue} testID="ng-required">{fmt(required)} L/min</Text>
            <Text style={styles.reqSub}>{targetRate || 0} L/ha · {travelSpeed || 0} km/h · {fmt(effectiveWidth, 2)} m effective width</Text>
            {mode === "spot" ? (
              <View style={styles.spotSummary}>
                <Summary label="Sprayed-area water rate" value={`${fmt(targetRate, 1)} L/ha`} />
                <Summary label="Whole-paddock average" value={`${fmt(wholePaddockWaterRate, 1)} L/ha`} />
                <Summary label="Area treated" value={`${fmt(treatedFraction * 100, 1)}%`} />
                {spotProductPerSprayedHa != null ? <Summary label="Product / sprayed ha" value={`${fmt(spotProductPerSprayedHa, 2)} L/ha`} /> : null}
                {spotProductPerPaddockHa != null ? <Summary label="Avg product / paddock ha" value={`${fmt(spotProductPerPaddockHa, 2)} L/ha`} /> : null}
              </View>
            ) : null}
          </Card>

          <Text style={styles.section}>Recommended</Text>
          {recommended.length === 0 ? (
            <Card><Text style={styles.empty}>Enter a valid rate, speed and width. If no nozzle appears, the required flow is outside the current curated nozzle list.</Text></Card>
          ) : recommended.map((r, i) => (
            <Card key={r.nozzle.id} style={[styles.recCard, i === 0 && styles.recCardTop]} testID={`ng-rec-${r.nozzle.id}`}>
              <View style={styles.row}>
                <View style={[styles.swatch, { backgroundColor: SWATCH[r.nozzle.colour] ?? colors.surfaceTertiary }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.recTitleRow}>
                    <Text style={styles.isoCode}>{r.nozzle.label}</Text>
                    {i === 0 ? <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>BEST MATCH</Text></View> : null}
                  </View>
                  <Text style={styles.flowLine}>Target pressure: {fmt(r.check.requiredPressureBar ?? 0, 2)} bar · {r.nozzle.type}</Text>
                  <Text style={styles.diff}>Operating range: {r.nozzle.minPressureBar}–{r.nozzle.maxPressureBar} bar</Text>
                  <Text style={styles.why}>{whyText(r.nozzle, goal, pwm, mode)}</Text>
                </View>
              </View>
            </Card>
          ))}

          <Pressable onPress={() => setShowManual((v) => !v)} style={styles.manualToggle} testID="ng-manual-toggle">
            <Icon name="format-list-bulleted" size={20} color={colors.brandPrimary} />
            <Text style={styles.manualToggleText}>{showManual ? "Hide manual nozzle list" : "Compare nozzles manually"}</Text>
            <Icon name={showManual ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
          </Pressable>

          {showManual ? (
            <>
              <Text style={styles.section}>Manual comparison</Text>
              {ranked.slice(0, 14).map((r) => (
                <Card key={`manual-${r.nozzle.id}`} style={{ marginBottom: spacing.sm }}>
                  <View style={styles.row}>
                    <View style={[styles.smallSwatch, { backgroundColor: SWATCH[r.nozzle.colour] ?? colors.surfaceTertiary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.altCode}>{r.nozzle.label}</Text>
                      <Text style={styles.altLine}>
                        {r.check.requiredPressureBar == null ? "—" : `${fmt(r.check.requiredPressureBar, 2)} bar required`} · {r.nozzle.type}
                      </Text>
                    </View>
                    <Icon name={r.inRange ? "check-circle" : "alert-circle-outline"} size={20} color={r.inRange ? colors.success : colors.warning} />
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <Card style={styles.safetyCard}>
            <View style={styles.safetyRow}>
              <Icon name="shield-alert-outline" size={22} color={colors.warning} />
              <Text style={styles.safetyTitle}>Before spraying</Text>
            </View>
            <Text style={styles.safetyText}>Chaser's recommendation is a setup aid, not a substitute for the chemical label or the nozzle manufacturer's current chart. Confirm permitted spray quality, pressure, nozzle type, buffer-zone requirements and target-selectable/spot-spray instructions before use.</Text>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Choice({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Icon name={icon as any} size={20} color={selected ? colors.onBrandPrimary : colors.brandPrimary} />
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

function whyText(n: Nozzle, goal: Goal, pwm: boolean, mode: ApplicationMode) {
  const reasons: string[] = [];
  const t = n.type.toLowerCase();
  if ((goal === "drift" || goal === "systemic") && (t.includes("air-induction") || t.includes("drift"))) reasons.push("favours drift reduction");
  if (["contact", "fungicide", "insecticide"].includes(goal) && (t.includes("flat fan") || t.includes("turbotee"))) reasons.push("favours coverage");
  if (pwm && n.id.includes("teejet-tt-")) reasons.push("manufacturer lists this family as PWM approved");
  if (mode === "spot") reasons.push("sized from the single-nozzle sprayed width, not whole-paddock coverage");
  if (reasons.length === 0) reasons.push("closest practical pressure match in the current nozzle library");
  return `Why: ${reasons.join(" · ")}.`;
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  segmentRow: { flexDirection: "row", gap: spacing.sm },
  choice: { flex: 1, minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: spacing.sm },
  choiceOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  choiceText: { color: colors.onSurface, fontWeight: "700", fontSize: 13, textAlign: "center" },
  choiceTextOn: { color: colors.onBrandPrimary },
  goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  goalBtn: { width: "48%", minHeight: 72, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", gap: 5, padding: spacing.sm },
  goalBtnOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  goalText: { color: colors.onSurface, fontSize: 12, fontWeight: "700", textAlign: "center" },
  goalTextOn: { color: colors.onBrandPrimary },
  help: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  inlineHint: { color: colors.muted, fontSize: 11, lineHeight: 15, fontStyle: "italic", marginTop: -2, marginBottom: spacing.sm },
  toggleCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  toggleCardOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  toggleTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 14 },
  toggleSub: { color: colors.muted, fontSize: 11, marginTop: 3, lineHeight: 15 },
  reqLabel: { fontSize: 12, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" },
  reqValue: { fontSize: 40, fontWeight: "900", color: colors.onBrandSecondary, marginTop: 3, textAlign: "center" },
  reqSub: { fontSize: 12, color: colors.onBrandSecondary, fontWeight: "600", textAlign: "center", marginTop: 3 },
  spotSummary: { borderTopWidth: 1, borderTopColor: colors.brandPrimary, marginTop: spacing.md, paddingTop: spacing.sm },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  summaryLabel: { color: colors.onBrandSecondary, fontSize: 12, flex: 1 },
  summaryValue: { color: colors.onBrandSecondary, fontSize: 12, fontWeight: "800" },
  recCard: { marginBottom: spacing.sm },
  recCardTop: { borderWidth: 2, borderColor: colors.brandPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  smallSwatch: { width: 30, height: 30, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  recTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  isoCode: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  bestBadge: { backgroundColor: colors.brandSecondary, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  bestBadgeText: { color: colors.brandPrimary, fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  flowLine: { fontSize: 13, color: colors.onSurface, marginTop: 3, fontWeight: "600" },
  diff: { fontSize: 11, color: colors.muted, marginTop: 2, fontWeight: "700" },
  why: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 6, lineHeight: 15 },
  altCode: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  altLine: { fontSize: 11, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 18 },
  manualToggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandSecondary },
  manualToggleText: { flex: 1, color: colors.brandPrimary, fontWeight: "800", fontSize: 13 },
  safetyCard: { marginTop: spacing.xl, borderColor: colors.warning },
  safetyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  safetyTitle: { color: colors.warning, fontSize: 14, fontWeight: "900" },
  safetyText: { color: colors.onSurfaceTertiary, fontSize: 11, lineHeight: 16, marginTop: spacing.sm },
});
