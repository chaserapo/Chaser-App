import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { previewDeductions, applyDeductions, DeductionPreview } from "@/src/lib/stock";
import { productTotalForJob } from "@/src/lib/calculators";
import type { SprayJob } from "@/src/lib/types";

function formatElapsed(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function ActiveJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<SprayJob | null>(null);
  const [now, setNow] = useState(Date.now());
  const [finishMode, setFinishMode] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actualHa, setActualHa] = useState("");
  const [finishNotes, setFinishNotes] = useState("");
  const [finishWeather, setFinishWeather] = useState<{ t?: string; h?: string; dt?: string; ws?: string; wd?: string; at?: string }>({});
  const [capturingFinishWx, setCapturingFinishWx] = useState(false);
  const [deductStock, setDeductStock] = useState(true);
  const [previews, setPreviews] = useState<DeductionPreview[]>([]);

  useFocusEffect(useCallback(() => { if (id) repo.sprayJobs.get(id as string).then((j) => { setJob(j); if (j?.area_ha) setActualHa(j.area_ha.toString()); }); }, [id]));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const startMs = useMemo(() => {
    if (!job) return 0;
    if (job.start_time && job.date) {
      const iso = `${job.date}T${job.start_time.length === 5 ? job.start_time + ":00" : job.start_time}`;
      const parsed = new Date(iso).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return new Date(job.created_at).getTime();
  }, [job]);

  async function startFinishFlow() {
    setCapturingFinishWx(true);
    try {
      const w = await fetchWeather();
      setFinishWeather({
        t: w.temperature_c.toFixed(1),
        h: w.humidity.toFixed(0),
        dt: w.delta_t.toFixed(1),
        ws: w.wind_speed.toFixed(0),
        wd: w.wind_direction,
        at: w.captured_at,
      });
    } catch (e) { console.warn(e); }
    finally { setCapturingFinishWx(false); setFinishMode(true); }
    // Compute deduction preview based on current job products + actualHa (or planned area)
    if (job) {
      const area = parseFloat(actualHa) || job.area_ha || 0;
      const water = job.water_rate || 0;
      const withTotals: SprayJob = {
        ...job,
        products: job.products.map((p) => {
          const t = productTotalForJob(p.rate, p.unit, area, water, p.custom_unit_label);
          return { ...p, total_qty: area > 0 ? t.amount : undefined, total_qty_unit: area > 0 ? t.unit : undefined };
        }),
      };
      const preview = await previewDeductions(withTotals);
      setPreviews(preview);
    }
  }

  async function completeJob() {
    if (!job) return;
    setFinishing(true);
    const completed: SprayJob = {
      ...job,
      status: "completed",
      finish_time: new Date().toTimeString().slice(0, 5),
      actual_area_ha: parseFloat(actualHa) || job.area_ha,
      finish_notes: finishNotes || undefined,
      finish_temperature_c: parseFloat(finishWeather.t ?? "") || undefined,
      finish_humidity: parseFloat(finishWeather.h ?? "") || undefined,
      finish_delta_t: parseFloat(finishWeather.dt ?? "") || undefined,
      finish_wind_speed: parseFloat(finishWeather.ws ?? "") || undefined,
      finish_wind_direction: finishWeather.wd || undefined,
      finish_weather_captured_at: finishWeather.at,
    };
    await repo.sprayJobs.save(completed);
    if (deductStock) await applyDeductions(previews, completed.id);
    router.replace({ pathname: "/records/[id]", params: { id: completed.id } });
  }

  async function cancelJob() {
    if (!job) return;
    await repo.sprayJobs.remove(job.id);
    router.replace("/(tabs)");
  }

  if (!job) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Active Job" back /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Active Spray Job" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom + 40 }} keyboardShouldPersistTaps="handled">

          <Card style={styles.timerCard} testID="active-timer-card">
            <View style={styles.liveDot} />
            <Text style={styles.liveLabel}>LIVE · Elapsed</Text>
            <Text style={styles.timer} testID="active-timer">{formatElapsed(now - startMs)}</Text>
            <Text style={styles.startInfo}>Started {job.start_time ?? "—"}</Text>
          </Card>

          <Card style={{ marginTop: spacing.md }}>
            <Text style={styles.h1}>{job.paddock_name ?? "Paddock"}</Text>
            <Text style={styles.h2}>{job.farm_name ?? ""} · {job.crop ?? ""}</Text>
            <View style={styles.divider} />
            <Row label="Target" value={job.target ?? "—"} />
            <Row label="Operator" value={job.operator ?? "—"} />
            <Row label="Machine" value={job.machinery_name ?? "—"} />
            <Row label="Area planned" value={job.area_ha != null ? `${job.area_ha} ha` : "—"} />
            <Row label="Water rate" value={job.water_rate != null ? `${job.water_rate} L/ha` : "—"} />
            <Row label="Speed" value={job.speed_kmh != null ? `${job.speed_kmh} km/h` : "—"} />
            <Row label="Nozzle" value={job.nozzle_type ?? "—"} />
          </Card>

          <Text style={styles.section}>Tank mix</Text>
          {job.products.length === 0 ? (
            <Card><Text style={styles.empty}>No products.</Text></Card>
          ) : (
            job.products.map((p) => (
              <Card key={p.id} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.pName}>{p.chemical_name}</Text>
                <Text style={styles.pMeta}>Rate: {p.rate} {p.unit}{p.total_qty ? ` · Total: ${p.total_qty.toFixed(2)} ${p.total_qty_unit ?? (p.unit === "%v/v" ? "L water" : p.unit.replace("/ha", ""))}` : ""}</Text>
              </Card>
            ))
          )}

          <Text style={styles.section}>Starting weather</Text>
          <Card>
            <View style={styles.wxGrid}>
              <Wx label="Temp" value={job.temperature_c != null ? `${job.temperature_c}°C` : "—"} />
              <Wx label="RH" value={job.humidity != null ? `${job.humidity}%` : "—"} />
              <Wx label="Delta T" value={job.delta_t != null ? `${job.delta_t}` : "—"} />
              <Wx label="Wind" value={job.wind_speed != null ? `${job.wind_speed} km/h` : "—"} />
              <Wx label="Dir" value={job.wind_direction ?? "—"} />
            </View>
            {job.gps_lat ? <Text style={styles.metaText}>GPS {job.gps_lat.toFixed(4)}, {job.gps_lon!.toFixed(4)}</Text> : null}
            <Text style={styles.discl}>Check current product label, weather conditions and local spraying requirements before application.</Text>
          </Card>

          {!finishMode ? (
            <>
              <View style={{ height: spacing.lg }} />
              <Button title="Finish Spray Job" icon="stop-circle-outline" size="lg" onPress={startFinishFlow} loading={capturingFinishWx} testID="finish-spray-job-btn" />
              <View style={{ height: spacing.sm }} />
              <Button title="Cancel Job" icon="close-circle-outline" variant="outline" onPress={cancelJob} testID="cancel-active-btn" />
            </>
          ) : (
            <>
              <Text style={styles.section}>Finish details</Text>
              <Card>
                <Input label="Actual hectares treated" value={actualHa} onChangeText={setActualHa} keyboardType="decimal-pad" suffix="ha" testID="input-actual-ha" />
                <Input label="Final notes" value={finishNotes} onChangeText={setFinishNotes} multiline testID="input-finish-notes" />
              </Card>

              <Text style={styles.section}>Finish weather</Text>
              <Card>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="Temp" value={finishWeather.t ?? ""} onChangeText={(v) => setFinishWeather({ ...finishWeather, t: v })} keyboardType="decimal-pad" suffix="°C" testID="finish-temp" /></View>
                  <View style={{ flex: 1 }}><Input label="RH" value={finishWeather.h ?? ""} onChangeText={(v) => setFinishWeather({ ...finishWeather, h: v })} keyboardType="decimal-pad" suffix="%" testID="finish-rh" /></View>
                  <View style={{ flex: 1 }}><Input label="Delta T" value={finishWeather.dt ?? ""} onChangeText={(v) => setFinishWeather({ ...finishWeather, dt: v })} keyboardType="decimal-pad" testID="finish-delta-t" /></View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}><Input label="Wind" value={finishWeather.ws ?? ""} onChangeText={(v) => setFinishWeather({ ...finishWeather, ws: v })} keyboardType="decimal-pad" suffix="km/h" testID="finish-wind" /></View>
                  <View style={{ flex: 1 }}><Input label="Direction" value={finishWeather.wd ?? ""} onChangeText={(v) => setFinishWeather({ ...finishWeather, wd: v })} testID="finish-wind-dir" /></View>
                </View>
              </Card>

              <View style={{ height: spacing.md }} />
              <Text style={styles.section}>Stock deduction</Text>
              <Card testID="deduction-card">
                <Pressable onPress={() => setDeductStock((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} testID="toggle-deduct-stock">
                  <View style={[{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.brandPrimary, backgroundColor: deductStock ? colors.brandPrimary : "transparent", alignItems: "center", justifyContent: "center" }]}>
                    {deductStock ? <Icon name="check" size={14} color={colors.onBrandPrimary} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: colors.onSurface }}>Deduct product usage from stock</Text>
                </Pressable>
                {deductStock && previews.length > 0 ? (
                  <View style={{ marginTop: spacing.md, gap: 6 }}>
                    {previews.map((p) => (
                      <View key={p.chemical_id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }} testID={`ded-row-${p.chemical_id}`}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSurface }} numberOfLines={1}>{p.chemical_name}</Text>
                          {p.note ? <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic" }}>{p.note}</Text> : (
                            <Text style={{ fontSize: 11, color: colors.muted }}>{p.before.toFixed(2)} → {p.after.toFixed(2)} packs ({p.packs_used?.toFixed(2)} used)</Text>
                          )}
                        </View>
                        {p.warning ? <View style={{ backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}><Text style={{ color: colors.onError, fontSize: 10, fontWeight: "800" }}>UNDER 0</Text></View> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
                {previews.some((p) => p.warning) && deductStock ? (
                  <Text style={{ marginTop: spacing.sm, fontSize: 12, color: colors.error, fontWeight: "700" }}>
                    ⚠ At least one chemical will drop below zero. Save will still proceed — check stock or uncheck deduction.
                  </Text>
                ) : null}
              </Card>

              <View style={{ height: spacing.md }} />
              <Button title={finishing ? "Saving…" : "Save Completed Record"} icon="content-save-check-outline" size="lg" onPress={completeJob} loading={finishing} testID="save-completed-btn" />
              <View style={{ height: spacing.sm }} />
              <Button title="Back" variant="outline" onPress={() => setFinishMode(false)} testID="back-to-active-btn" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}
function Wx({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.wxBox}>
      <Text style={styles.wxValue}>{value}</Text>
      <Text style={styles.wxLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timerCard: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary, alignItems: "center", padding: spacing.xl },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.onBrandPrimary, opacity: 0.9 },
  liveLabel: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "800", marginTop: 6, letterSpacing: 1.5 },
  timer: { color: colors.onBrandPrimary, fontSize: 56, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  startInfo: { color: colors.onBrandPrimary, opacity: 0.9, fontSize: 12, fontWeight: "600", marginTop: 4 },
  h1: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  h2: { fontSize: 14, color: colors.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  rowLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  wxGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  wxBox: { flexGrow: 1, minWidth: "18%", backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  wxValue: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  wxLabel: { fontSize: 10, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: 2 },
  metaText: { fontSize: 12, color: colors.muted, marginTop: 8, fontWeight: "600" },
  discl: { fontSize: 11, color: colors.muted, marginTop: 8, lineHeight: 15 },
  empty: { color: colors.muted, textAlign: "center", fontStyle: "italic" },
});
