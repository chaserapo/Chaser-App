import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { harvestOfflineQueue } from "@/src/lib/harvest-offline-queue";
import { flushOfflineHarvestJobs } from "@/src/lib/cloud-repo";
import type { HarvestJob, HarvestYieldUnit } from "@/src/lib/types";

const YIELD_UNITS: { id: HarvestYieldUnit; label: string }[] = [
  { id: "t_ha", label: "t/ha" },
  { id: "bu_ac", label: "bu/ac" },
];

function elapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ActiveHarvestJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<HarvestJob | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [actualHa, setActualHa] = useState("");
  const [yieldValue, setYieldValue] = useState("");
  const [yieldUnit, setYieldUnit] = useState<HarvestYieldUnit>("t_ha");
  const [moisture, setMoisture] = useState("");
  const [protein, setProtein] = useState("");
  const [screenings, setScreenings] = useState("");
  const [grade, setGrade] = useState("");
  const [destination, setDestination] = useState("");
  const [finishNotes, setFinishNotes] = useState("");
  const [finishWeather, setFinishWeather] = useState<{ t?: number; h?: number; ws?: number; wd?: string; at?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    repo.harvestJobs.get(id).then((j) => {
      setJob(j);
      if (j?.area_ha != null) setActualHa(String(j.area_ha));
      if (j) setBusinessId(j.business_id || null);
    });
  }, [id]));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the live elapsed-time clock immediately on mount instead of waiting a full second for the first interval tick.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!id || !businessId) return;
    const t = setInterval(() => { harvestOfflineQueue.isPending(businessId, id).then(setPending); }, 4000);
    return () => clearInterval(t);
  }, [id, businessId]);

  if (!job) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Harvest Job" back /></View>;
  }

  const startMs = (() => {
    if (job.date && job.start_time) {
      const d = new Date(`${job.date}T${job.start_time}:00`);
      if (!isNaN(d.getTime())) return d.getTime();
    }
    return new Date(job.created_at).getTime();
  })();

  async function startFinishFlow() {
    setFinishing(true);
    try {
      const w = await fetchWeather();
      setFinishWeather({ t: w.temperature_c, h: w.humidity, ws: w.wind_speed, wd: w.wind_direction, at: w.captured_at });
    } catch {
      // Finish weather is best-effort — don't block finishing the job on it.
    }
  }

  async function completeJob() {
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      const completed: HarvestJob = {
        ...job,
        status: "completed",
        finish_time: new Date().toTimeString().slice(0, 5),
        actual_area_ha: parseFloat(actualHa) || job.area_ha,
        yield_value: parseFloat(yieldValue) || undefined,
        yield_unit: yieldValue ? yieldUnit : undefined,
        moisture_pct: moisture ? parseFloat(moisture) || undefined : undefined,
        protein_pct: protein ? parseFloat(protein) || undefined : undefined,
        screenings_pct: screenings ? parseFloat(screenings) || undefined : undefined,
        grade: grade.trim() || undefined,
        destination: destination.trim() || undefined,
        finish_notes: finishNotes.trim() || undefined,
        finish_temperature_c: finishWeather?.t,
        finish_humidity: finishWeather?.h,
        finish_wind_speed: finishWeather?.ws,
        finish_wind_direction: finishWeather?.wd,
        finish_weather_captured_at: finishWeather?.at,
      };
      await repo.harvestJobs.save(completed);
      router.replace({ pathname: "/harvest-records/[id]", params: { id: completed.id } });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't complete the job");
    } finally {
      setSaving(false);
    }
  }

  function cancelJob() {
    if (!job) return;
    const jobId = job.id;
    Alert.alert("Cancel this job?", "This can't be undone.", [
      { text: "Keep job", style: "cancel" },
      {
        text: "Cancel job", style: "destructive", onPress: async () => {
          await repo.harvestJobs.remove(jobId);
          router.replace("/(tabs)/harvest");
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={finishing ? "Finish Harvest Job" : "Harvest Job"} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>

        {pending ? (
          <Pressable onPress={() => flushOfflineHarvestJobs()} style={styles.pendingBanner} testID="offline-pending-banner">
            <Icon name="cloud-sync-outline" size={16} color={colors.warning} />
            <Text style={styles.pendingText}>Saved locally — waiting for reception. Tap to retry.</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={styles.errorBox}><Icon name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
          <Text style={styles.title}>{job.paddock_name ?? job.farm_name ?? "Harvest job"}</Text>
          <Text style={styles.sub}>{job.crop ?? "—"} · {job.area_ha ?? "—"} ha · {job.operator ?? "—"}</Text>
          <Text style={styles.meta}>Running {now > 0 ? elapsed(now - startMs) : "—"} · {job.machinery_name ?? "—"}</Text>
        </Card>

        <Text style={styles.section}>Starting conditions</Text>
        <Card>
          <Text style={styles.calcLine}>
            {job.temperature_c != null ? `${job.temperature_c}°C` : "—"} · {job.humidity != null ? `${job.humidity}% RH` : "—"} · {job.wind_speed != null ? `${job.wind_speed} km/h ${job.wind_direction ?? ""}` : "—"}
          </Text>
        </Card>

        {!finishing ? (
          <>
            <View style={{ height: spacing.lg }} />
            <Button title="Finish Harvest Job" icon="check-decagram" size="lg" onPress={startFinishFlow} testID="finish-job-btn" />
            <View style={{ height: spacing.sm }} />
            <Button title="Cancel Job" icon="close-circle-outline" variant="ghost" onPress={cancelJob} testID="cancel-job-btn" />
          </>
        ) : (
          <>
            <Text style={styles.section}>Results</Text>
            <Card>
              <Input label="Actual area harvested" value={actualHa} onChangeText={setActualHa} keyboardType="decimal-pad" suffix="ha" testID="input-actual-area" />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Yield" value={yieldValue} onChangeText={setYieldValue} keyboardType="decimal-pad" testID="input-yield" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerLabel}>Unit</Text>
                  <View style={styles.chipRow}>
                    {YIELD_UNITS.map((u) => (
                      <Chip key={u.id} label={u.label} active={yieldUnit === u.id} onPress={() => setYieldUnit(u.id)} testID={`yield-unit-${u.id}`} />
                    ))}
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Moisture" value={moisture} onChangeText={setMoisture} keyboardType="decimal-pad" suffix="%" testID="input-moisture" /></View>
                <View style={{ flex: 1 }}><Input label="Protein" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="%" testID="input-protein" /></View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Input label="Screenings" value={screenings} onChangeText={setScreenings} keyboardType="decimal-pad" suffix="%" testID="input-screenings" /></View>
                <View style={{ flex: 1 }}><Input label="Grade" value={grade} onChangeText={setGrade} placeholder="e.g. H2, APW, Feed" testID="input-grade" /></View>
              </View>
              <Input label="Destination" value={destination} onChangeText={setDestination} placeholder="e.g. On-farm silo, direct to buyer" testID="input-destination" />
              <Input label="Final notes" value={finishNotes} onChangeText={setFinishNotes} multiline testID="input-finish-notes" />
              <Text style={styles.calcLine}>
                Finish weather: {finishWeather?.t != null ? `${finishWeather.t}°C` : "capturing…"} {finishWeather?.h != null ? `· ${finishWeather.h}% RH` : ""}
              </Text>
            </Card>
            <View style={{ height: spacing.md }} />
            <Button title="Complete Job" icon="check-decagram" size="lg" onPress={completeJob} loading={saving} disabled={saving} testID="complete-job-btn" />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  calcLine: { fontSize: 14, color: colors.onSurface },
  pickerLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pendingBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: radius.md, marginBottom: spacing.md },
  pendingText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: "600" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
