import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Input, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { nozzleFlowLpm, numNozzles, totalBoomFlowLpm, hectaresPerTank, chemicalPerTank, fmt } from "@/src/lib/calculators";
import { NOZZLES, checkNozzle, type Nozzle } from "@/src/lib/nozzles";
import { repo } from "@/src/lib/storage";
import type { Machinery } from "@/src/lib/types";

export default function SprayRateCalc() {
  const insets = useSafeAreaInsets();
  const [rate, setRate] = useState("80");
  const [speed, setSpeed] = useState("18");
  const [spacing_, setSpacing] = useState("0.5");
  const [boom, setBoom] = useState("30");
  const [tank, setTank] = useState("4000");
  const [chemRate, setChemRate] = useState("1.5");
  const [nozzleId, setNozzleId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [sprayers, setSprayers] = useState<Machinery[]>([]);
  const [machineryPickerOpen, setMachineryPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await repo.machinery.active();
        setSprayers(all.filter((m: Machinery) => m.machine_type === "Self-propelled sprayer" || m.machine_type === "Tow-behind sprayer"));
      } catch { /* ignore */ }
    })();
  }, []);

  function loadFromMachinery(m: Machinery) {
    if (m.default_water_rate_lha) setRate(String(m.default_water_rate_lha));
    if (m.default_speed_kmh)      setSpeed(String(m.default_speed_kmh));
    if (m.nozzle_spacing_m)       setSpacing(String(m.nozzle_spacing_m));
    if (m.boom_width_m)           setBoom(String(m.boom_width_m));
    if (m.tank_capacity_l)        setTank(String(m.tank_capacity_l));
    if (m.default_nozzle && NOZZLES.find((n) => n.id === m.default_nozzle)) {
      setNozzleId(m.default_nozzle);
    }
    setMachineryPickerOpen(false);
  }

  const r = parseFloat(rate) || 0;
  const s = parseFloat(speed) || 0;
  const sp = parseFloat(spacing_) || 0;
  const bw = parseFloat(boom) || 0;
  const t = parseFloat(tank) || 0;
  const cr = parseFloat(chemRate) || 0;

  const results = useMemo(() => {
    const nozzle = nozzleFlowLpm(r, s, sp);
    const nn = numNozzles(bw, sp);
    const total = totalBoomFlowLpm(nozzle, nn);
    const hpt = hectaresPerTank(t, r);
    const chem = chemicalPerTank(cr, hpt);
    return { nozzle, nn, total, hpt, chem };
  }, [r, s, sp, bw, t, cr]);

  const selectedNozzle: Nozzle | null = useMemo(
    () => (nozzleId ? NOZZLES.find((n) => n.id === nozzleId) ?? null : null),
    [nozzleId]
  );
  const nozzleCheck = useMemo(
    () => (selectedNozzle ? checkNozzle(selectedNozzle, results.nozzle) : null),
    [selectedNozzle, results.nozzle]
  );

  const brands = Array.from(new Set(NOZZLES.map((n) => n.brand)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Spray Tools" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {sprayers.length > 0 ? (
            <>
              <Pressable onPress={() => setMachineryPickerOpen((v) => !v)} testID="load-from-sprayer-btn" style={styles.loadSprayerBtn}>
                <Icon name="tractor-variant" size={18} color={colors.brandPrimary} />
                <Text style={styles.loadSprayerText}>Load from my sprayer</Text>
                <Icon name={machineryPickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.brandPrimary} />
              </Pressable>
              {machineryPickerOpen ? (
                <View style={styles.sprayerList} testID="sprayer-list">
                  {sprayers.map((m) => (
                    <Pressable key={m.id} onPress={() => loadFromMachinery(m)} style={styles.sprayerRow} testID={`sprayer-${m.id}`}>
                      <Icon name="sprinkler-variant" size={18} color={colors.brandPrimary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sprayerName}>{m.name}</Text>
                        <Text style={styles.sprayerSub}>
                          {m.default_nozzle && NOZZLES.find((n) => n.id === m.default_nozzle) ? NOZZLES.find((n) => n.id === m.default_nozzle)!.label : "No default nozzle"}
                          {m.boom_width_m ? ` · ${m.boom_width_m}m boom` : ""}
                          {m.default_water_rate_lha ? ` · ${m.default_water_rate_lha} L/ha` : ""}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={{ height: spacing.md }} />
            </>
          ) : null}
          <Card>
            <Input label="Application rate" value={rate} onChangeText={setRate} keyboardType="decimal-pad" suffix="L/ha" testID="input-rate" />
            <Input label="Speed" value={speed} onChangeText={setSpeed} keyboardType="decimal-pad" suffix="km/h" testID="input-speed" />
            <Input label="Nozzle spacing" value={spacing_} onChangeText={setSpacing} keyboardType="decimal-pad" suffix="m" testID="input-spacing" />
            <Input label="Boom width" value={boom} onChangeText={setBoom} keyboardType="decimal-pad" suffix="m" testID="input-boom" />
            <Input label="Tank capacity" value={tank} onChangeText={setTank} keyboardType="decimal-pad" suffix="L" testID="input-tank" />
            <Input label="Chemical rate" value={chemRate} onChangeText={setChemRate} keyboardType="decimal-pad" suffix="L/ha" testID="input-chem-rate" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }}>
            <Text style={styles.resultTitle}>Results</Text>

            {/* ── Nozzle flow with pickable nozzle + suitability check ── */}
            <View style={[styles.row, styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Required nozzle flow</Text>
              </View>
              <Text style={styles.rowValue} testID="result-nozzle-flow">{fmt(results.nozzle)} L/min</Text>
            </View>

            <View style={[styles.row, styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Selected nozzle</Text>
              </View>
              <Pressable onPress={() => setPickerOpen((v) => !v)} testID="nozzle-select-btn" style={styles.nozzleSelectBtn}>
                <Text style={styles.nozzleSelectText}>
                  {selectedNozzle ? `${selectedNozzle.brand} ${selectedNozzle.iso.toUpperCase()} · ${selectedNozzle.colour}` : "Not selected"}
                </Text>
                <Icon name={pickerOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.onBrandSecondary} />
              </Pressable>
            </View>
            <Text style={styles.rowHint}>
              {selectedNozzle
                ? `Rated at ${selectedNozzle.ratedPressureBar} bar · Working range ${selectedNozzle.minPressureBar}–${selectedNozzle.maxPressureBar} bar`
                : "Select a nozzle to check suitability at 3 bar"}
            </Text>

            {pickerOpen ? (
              <View style={styles.pickerWrap} testID="nozzle-picker">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
                  <Pressable onPress={() => setBrandFilter(null)} style={[styles.brandChip, !brandFilter && styles.brandChipActive]}>
                    <Text style={[styles.brandChipText, !brandFilter && styles.brandChipTextActive]}>All brands</Text>
                  </Pressable>
                  {brands.map((b) => (
                    <Pressable key={b} onPress={() => setBrandFilter(b)} style={[styles.brandChip, brandFilter === b && styles.brandChipActive]}>
                      <Text style={[styles.brandChipText, brandFilter === b && styles.brandChipTextActive]}>{b}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
                  {NOZZLES.filter((n) => !brandFilter || n.brand === brandFilter).map((n) => {
                    const active = nozzleId === n.id;
                    return (
                      <Pressable
                        key={n.id}
                        onPress={() => { setNozzleId(n.id); setPickerOpen(false); }}
                        style={[styles.nozzleRow, active && styles.nozzleRowActive]}
                        testID={`nozzle-option-${n.id}`}
                      >
                        <View style={[styles.colourDot, { backgroundColor: colourToHex(n.colour) }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.nozzleLabel}>{n.label}</Text>
                          <Text style={styles.nozzleSub}>{n.type} · {n.ratedFlowLpm.toFixed(2)} L/min @ {n.ratedPressureBar} bar</Text>
                        </View>
                        {active ? <Icon name="check" size={18} color={colors.brandPrimary} /> : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {selectedNozzle && nozzleCheck ? (
              <View style={styles.checkBox} testID="nozzle-check">
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Nozzle @ {selectedNozzle.ratedPressureBar} bar</Text>
                  <Text style={styles.rowValue}>{nozzleCheck.ratedFlowAtRefLpm.toFixed(2)} L/min</Text>
                </View>
                <SuitabilityBadge suitability={nozzleCheck.suitability} message={nozzleCheck.message} />
                {nozzleCheck.requiredPressureBar != null ? (
                  <View style={[styles.row, { marginTop: 6 }]}>
                    <Text style={styles.rowLabel}>Required pressure</Text>
                    <Text style={styles.rowValue}>{nozzleCheck.requiredPressureBar.toFixed(2)} bar</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Number of nozzles</Text>
              <Text style={styles.rowValue} testID="result-nozzles">{results.nn}</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Total boom flow</Text>
              <Text style={styles.rowValue} testID="result-boom-flow">{fmt(results.total)} L/min</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Hectares per tank</Text>
              <Text style={styles.rowValue} testID="result-hpt">{fmt(results.hpt)} ha</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Chemical per tank</Text>
              <Text style={styles.rowValue} testID="result-chem-tank">{fmt(results.chem)} L</Text>
            </View>
          </Card>

          <Text style={styles.formula}>
            L/min per nozzle = L/ha × speed × nozzle spacing ÷ 600 · Flow ∝ √pressure
          </Text>
          <Text style={styles.disclaimer}>
            Nozzle data is indicative. Always verify against the manufacturer's chart and current label requirements before spraying.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SuitabilityBadge({ suitability, message }: { suitability: "good" | "undersized" | "oversized" | "out_of_range"; message: string }) {
  const map = {
    good:         { icon: "check-circle", color: "#16A34A", bg: "#DCFCE7", label: "Well matched" },
    undersized:   { icon: "arrow-up-bold-circle", color: colors.warning, bg: "#FEF3C7", label: "Slightly undersized" },
    oversized:    { icon: "arrow-down-bold-circle", color: colors.warning, bg: "#FEF3C7", label: "Slightly oversized" },
    out_of_range: { icon: "alert-circle", color: colors.error, bg: "#FEE2E2", label: "Out of range" },
  } as const;
  const style = map[suitability];
  return (
    <View style={[styles.suitRow, { backgroundColor: style.bg }]} testID={`suit-${suitability}`}>
      <Icon name={style.icon as any} size={16} color={style.color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.suitLabel, { color: style.color }]}>{style.label}</Text>
        <Text style={styles.suitMsg}>{message}</Text>
      </View>
    </View>
  );
}

function colourToHex(colour: string): string {
  const map: Record<string, string> = {
    Orange: "#F97316", Green: "#22C55E", Yellow: "#EAB308", Lilac: "#C4B5FD",
    Blue: "#3B82F6", Red: "#EF4444", Brown: "#A16207", Grey: "#9CA3AF", White: "#F3F4F6",
  };
  return map[colour] ?? "#9CA3AF";
}

const styles = StyleSheet.create({
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.onBrandSecondary, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.md, gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.brandPrimary + "20" },
  rowLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  rowValue: { fontSize: 18, color: colors.onBrandSecondary, fontWeight: "800" },
  rowHint: { fontSize: 11, color: colors.onBrandSecondary + "AA", marginTop: -6, marginBottom: 8, fontStyle: "italic" },
  nozzleSelectBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.brandPrimary + "60", backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm },
  nozzleSelectText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  pickerWrap: { marginTop: 8, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary + "40", backgroundColor: colors.surface, borderRadius: radius.md, padding: 8 },
  brandChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.brandPrimary + "60", backgroundColor: colors.surface },
  brandChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  brandChipText: { fontSize: 11, fontWeight: "700", color: colors.brandPrimary },
  brandChipTextActive: { color: colors.onBrandPrimary },
  nozzleRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.sm },
  nozzleRowActive: { backgroundColor: colors.brandSecondary },
  colourDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  nozzleLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  nozzleSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
  checkBox: { marginTop: 6, marginBottom: 8, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary + "30" },
  suitRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 6, padding: 8, borderRadius: radius.sm },
  suitLabel: { fontSize: 12, fontWeight: "800" },
  suitMsg: { fontSize: 11, color: colors.onSurfaceTertiary, marginTop: 2, lineHeight: 15 },
  formula: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.lg, fontStyle: "italic" },
  disclaimer: { fontSize: 10, color: colors.muted, textAlign: "center", marginTop: 6, fontStyle: "italic", lineHeight: 13 },
  loadSprayerBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandSecondary, borderWidth: 1, borderColor: colors.brandPrimary },
  loadSprayerText: { flex: 1, fontSize: 14, color: colors.brandPrimary, fontWeight: "800" },
  sprayerList: { marginTop: 6, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  sprayerRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  sprayerName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  sprayerSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
