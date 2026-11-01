import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { seedingOfflineQueue } from "@/src/lib/seeding-offline-queue";
import { flushOfflineSeedingJobs } from "@/src/lib/cloud-repo";
import type { SeedingJob } from "@/src/lib/types";

function elapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ActiveSeedingJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [job, setJob] = useState<SeedingJob | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [actualHa, setActualHa] = useState("");
  const [finishNotes, setFinishNotes] = useState("");
  const [finishWeather, setFinishWeather] = useState<{ t?: number; h?: number; ws?: number; wd?: string; at?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    repo.seedingJobs.get(id).then((j) => {
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
    const t = setInterval(() => { seedingOfflineQueue.isPending(businessId, id).then(setPending); }, 4000);
    return () => clearInterval(t);
  }, [id, businessId]);

  if (!job) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Seeding Job" back /></View>;
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
      const completed: SeedingJob = {
        ...job,
        status: "completed",
        finish_time: new Date().toTimeString().slice(0, 5),
        actual_area_ha: parseFloat(actualHa) || job.area_ha,
        finish_notes: finishNotes.trim() || undefined,
        finish_temperature_c: finishWeather?.t,
        finish_humidity: finishWeather?.h,
        finish_wind_speed: finishWeather?.ws,
        finish_wind_direction: finishWeather?.wd,
        finish_weather_captured_at: finishWeather?.at,
      };
      await repo.seedingJobs.save(completed);
      router.replace({ pathname: "/seeding-records/[id]", params: { id: completed.id } });
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
          await repo.seedingJobs.remove(jobId);
          router.replace("/(tabs)/seeding");
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={finishing ? "Finish Seeding Job" : "Seeding Job"} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>

        {pending ? (
          <Pressable onPress={() => flushOfflineSeedingJobs()} style={styles.pendingBanner} testID="offline-pending-banner">
            <Icon name="cloud-sync-outline" size={16} color={colors.warning} />
            <Text style={styles.pendingText}>Saved locally — waiting for reception. Tap to retry.</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={styles.errorBox}><Icon name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        <Card style={{ borderLeftWidth: 4, borderLeftColor: colors.warning }}>
          <Text style={styles.title}>{job.paddock_name ?? job.farm_name ?? "Seeding job"}</Text>
          <Text style={styles.sub}>{job.crop ?? "—"} · {job.area_ha ?? "—"} ha · {job.operator ?? "—"}</Text>
          <Text style={styles.meta}>Running {now > 0 ? elapsed(now - startMs) : "—"} · Seed rate {job.seed_rate_kg_ha != null ? `${job.seed_rate_kg_ha.toFixed(1)} kg/ha` : "—"}</Text>
        </Card>

        <Text style={styles.section}>Starting conditions</Text>
        <Card>
          <Text style={styles.calcLine}>
            {job.temperature_c != null ? `${job.temperature_c}°C` : "—"} · {job.humidity != null ? `${job.humidity}% RH` : "—"} · {job.wind_speed != null ? `${job.wind_speed} km/h ${job.wind_direction ?? ""}` : "—"}
          </Text>
        </Card>

        {job.products.length > 0 ? (
          <>
            <Text style={styles.section}>Products</Text>
            {job.products.map((p) => (
              <Card key={p.id} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.prodName}>{p.chemical_name}</Text>
                <Text style={styles.prodMeta}>Rate: {p.rate} {p.unit}{p.total_qty != null ? ` · Total: ${p.total_qty.toFixed(2)} ${p.total_qty_unit ?? ""}` : ""}</Text>
              </Card>
            ))}
          </>
        ) : null}

        {!finishing ? (
          <>
            <View style={{ height: spacing.lg }} />
            <Button title="Finish Seeding Job" icon="check-decagram" size="lg" onPress={startFinishFlow} testID="finish-job-btn" />
            <View style={{ height: spacing.sm }} />
            <Button title="Cancel Job" icon="close-circle-outline" variant="ghost" onPress={cancelJob} testID="cancel-job-btn" />
          </>
        ) : (
          <>
            <Text style={styles.section}>Finish</Text>
            <Card>
              <Input label="Actual area sown" value={actualHa} onChangeText={setActualHa} keyboardType="decimal-pad" suffix="ha" testID="input-actual-area" />
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
  prodName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  prodMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  pendingBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: radius.md, marginBottom: spacing.md },
  pendingText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: "600" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
