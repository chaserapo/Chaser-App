import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { deltaT } from "@/src/lib/calculators";
import type { Farm, Paddock, Machinery, Chemical, RateUnit, SprayJob, SprayJobProduct, SprayJobStatus } from "@/src/lib/types";

const UNITS: RateUnit[] = ["L/ha", "mL/ha", "kg/ha", "g/ha", "%v/v"];

export default function NewSprayJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string }>();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [machs, setMachs] = useState<Machinery[]>([]);
  const [chems, setChems] = useState<Chemical[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [starting, setStarting] = useState(false);
  const [products, setProducts] = useState<(SprayJobProduct & { rateStr: string })[]>([]);
  const [gps, setGps] = useState<{ lat?: number; lon?: number }>({});
  const [weatherAt, setWeatherAt] = useState<string | undefined>();

  const [f, setF] = useState({
    farm_id: "", farm_name: "", paddock_id: "", paddock_name: "",
    crop: "", target: "",
    operator: "", machinery_id: "", machinery_name: "",
    area_ha: "", water_rate: "80", speed_kmh: "18",
    boom_width_m: "30", nozzle_type: "", nozzle_spacing_m: "0.5", pressure: "3",
    start_time: new Date().toTimeString().slice(0, 5),
    temperature_c: "", humidity: "", delta_t: "",
    wind_speed: "", wind_direction: "",
    notes: "",
  });

  useFocusEffect(useCallback(() => {
    (async () => {
      const [fa, pa, ma, ch] = await Promise.all([repo.farms.list(), repo.paddocks.list(), repo.machinery.list(), repo.chemicals.list()]);
      setFarms(fa); setPaddocks(pa); setMachs(ma); setChems(ch);
    })();
  }, []));

  // Load draft if resuming
  useEffect(() => {
    (async () => {
      if (!params.draft) return;
      const draft = await repo.sprayJobs.get(params.draft as string);
      if (!draft) return;
      setF((s) => ({
        ...s,
        farm_id: draft.farm_id ?? "", farm_name: draft.farm_name ?? "",
        paddock_id: draft.paddock_id ?? "", paddock_name: draft.paddock_name ?? "",
        crop: draft.crop ?? "", target: draft.target ?? "",
        operator: draft.operator ?? "",
        machinery_id: draft.machinery_id ?? "", machinery_name: draft.machinery_name ?? "",
        area_ha: draft.area_ha?.toString() ?? "",
        water_rate: draft.water_rate?.toString() ?? s.water_rate,
        speed_kmh: draft.speed_kmh?.toString() ?? s.speed_kmh,
        boom_width_m: draft.boom_width_m?.toString() ?? s.boom_width_m,
        nozzle_type: draft.nozzle_type ?? "",
        nozzle_spacing_m: draft.nozzle_spacing_m?.toString() ?? s.nozzle_spacing_m,
        pressure: draft.pressure?.toString() ?? s.pressure,
        start_time: draft.start_time ?? s.start_time,
        notes: draft.notes ?? "",
      }));
      setProducts(draft.products.map((p) => ({ ...p, rateStr: p.rate.toString() })));
    })();
  }, [params.draft]);

  useEffect(() => { captureWeather(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function captureWeather() {
    setLoadingWeather(true);
    try {
      const w = await fetchWeather();
      setF((s) => ({
        ...s,
        temperature_c: w.temperature_c.toFixed(1),
        humidity: w.humidity.toFixed(0),
        delta_t: w.delta_t.toFixed(1),
        wind_speed: w.wind_speed.toFixed(0),
        wind_direction: w.wind_direction,
      }));
      setGps({ lat: w.lat, lon: w.lon });
      setWeatherAt(w.captured_at);
    } catch (e) { console.warn(e); }
    finally { setLoadingWeather(false); }
  }

  function updateTempOrRh(field: "temperature_c" | "humidity", val: string) {
    setF((s) => {
      const next = { ...s, [field]: val };
      const t = parseFloat(next.temperature_c);
      const h = parseFloat(next.humidity);
      if (!isNaN(t) && !isNaN(h)) next.delta_t = deltaT(t, h).toFixed(1);
      return next;
    });
  }

  function addProduct(c: Chemical) {
    setProducts((ps) => [
      ...ps,
      {
        id: uuid(), chemical_id: c.id, chemical_name: c.product_name,
        rate: c.default_rate ?? 1, rateStr: (c.default_rate ?? 1).toString(),
        unit: (c.default_unit as RateUnit) ?? "L/ha",
      },
    ]);
  }
  function updateProduct(id: string, patch: Partial<SprayJobProduct & { rateStr: string }>) {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, rate: patch.rateStr !== undefined ? parseFloat(patch.rateStr) || 0 : p.rate } : p)));
  }
  function removeProduct(id: string) { setProducts((ps) => ps.filter((p) => p.id !== id)); }

  const farmPaddocks = paddocks.filter((p) => p.farm_id === f.farm_id);

  function buildJob(status: SprayJobStatus): SprayJob | null {
    const area = parseFloat(f.area_ha) || 0;
    return {
      id: params.draft ? (params.draft as string) : uuid(),
      business_id: "",
      status,
      farm_id: f.farm_id || undefined, farm_name: f.farm_name || undefined,
      paddock_id: f.paddock_id || undefined, paddock_name: f.paddock_name || undefined,
      crop: f.crop || undefined, target: f.target || undefined,
      date: new Date().toISOString().slice(0, 10),
      start_time: f.start_time || undefined,
      operator: f.operator || undefined,
      machinery_id: f.machinery_id || undefined, machinery_name: f.machinery_name || undefined,
      area_ha: area || undefined,
      water_rate: parseFloat(f.water_rate) || undefined,
      speed_kmh: parseFloat(f.speed_kmh) || undefined,
      boom_width_m: parseFloat(f.boom_width_m) || undefined,
      nozzle_type: f.nozzle_type || undefined,
      nozzle_spacing_m: parseFloat(f.nozzle_spacing_m) || undefined,
      pressure: parseFloat(f.pressure) || undefined,
      temperature_c: parseFloat(f.temperature_c) || undefined,
      humidity: parseFloat(f.humidity) || undefined,
      delta_t: parseFloat(f.delta_t) || undefined,
      wind_speed: parseFloat(f.wind_speed) || undefined,
      wind_direction: f.wind_direction || undefined,
      weather_captured_at: weatherAt,
      gps_lat: gps.lat, gps_lon: gps.lon,
      notes: f.notes || undefined,
      products: products.map((p) => ({
        id: p.id, chemical_id: p.chemical_id, chemical_name: p.chemical_name,
        rate: p.rate, unit: p.unit,
        total_qty: area > 0 ? p.rate * area : undefined,
      })),
      created_at: new Date().toISOString(),
    };
  }

  async function startJob() {
    const business = await repo.getBusiness();
    if (!business) return;
    const existing = await repo.sprayJobs.active();
    if (existing) {
      router.replace({ pathname: "/active-job/[id]", params: { id: existing.id } });
      return;
    }
    setStarting(true);
    try {
      // Capture fresh weather one more time at the moment of Start
      await captureWeather();
    } catch {}
    const job = buildJob("active");
    if (!job) return;
    job.business_id = business.id;
    job.start_time = new Date().toTimeString().slice(0, 5);
    await repo.sprayJobs.save(job);
    setStarting(false);
    router.replace({ pathname: "/active-job/[id]", params: { id: job.id } });
  }

  async function saveDraft() {
    const business = await repo.getBusiness();
    if (!business) return;
    const job = buildJob("draft");
    if (!job) return;
    job.business_id = business.id;
    await repo.sprayJobs.save(job);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Spray Job" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom + 100 }} keyboardShouldPersistTaps="handled">

          <Text style={styles.section}>Location</Text>
          <Card>
            <Text style={styles.chipLabel}>Farm</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {farms.map((fa) => (
                <Chip key={fa.id} label={fa.name} active={f.farm_id === fa.id} onPress={() => setF({ ...f, farm_id: fa.id, farm_name: fa.name, paddock_id: "", paddock_name: "" })} testID={`farm-chip-${fa.id}`} />
              ))}
            </ScrollView>
            {farmPaddocks.length > 0 && (
              <>
                <Text style={styles.chipLabel}>Paddock</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {farmPaddocks.map((p) => (
                    <Chip key={p.id} label={p.name} active={f.paddock_id === p.id}
                      onPress={() => setF({ ...f, paddock_id: p.id, paddock_name: p.name, crop: p.crop ?? f.crop, area_ha: p.area_ha ? p.area_ha.toString() : f.area_ha })}
                      testID={`paddock-chip-${p.id}`} />
                  ))}
                </ScrollView>
              </>
            )}
            <Input label="Crop" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} testID="input-crop" />
            <Input label="Target weed / pest" value={f.target} onChangeText={(v) => setF({ ...f, target: v })} testID="input-target" />
            <Input label="Area to be treated" value={f.area_ha} onChangeText={(v) => setF({ ...f, area_ha: v })} keyboardType="decimal-pad" suffix="ha" testID="input-area" />
          </Card>

          <Text style={styles.section}>Operator & Machine</Text>
          <Card>
            <Input label="Operator" value={f.operator} onChangeText={(v) => setF({ ...f, operator: v })} testID="input-operator" />
            <Text style={styles.chipLabel}>Machine / sprayer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {machs.map((m) => (
                <Chip key={m.id} label={m.name} active={f.machinery_id === m.id} onPress={() => setF({ ...f, machinery_id: m.id, machinery_name: m.name })} testID={`mach-chip-${m.id}`} />
              ))}
            </ScrollView>
          </Card>

          <Text style={styles.section}>Application setup</Text>
          <Card>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Water rate" value={f.water_rate} onChangeText={(v) => setF({ ...f, water_rate: v })} keyboardType="decimal-pad" suffix="L/ha" testID="input-water" /></View>
              <View style={{ flex: 1 }}><Input label="Speed" value={f.speed_kmh} onChangeText={(v) => setF({ ...f, speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" testID="input-speed" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Boom width" value={f.boom_width_m} onChangeText={(v) => setF({ ...f, boom_width_m: v })} keyboardType="decimal-pad" suffix="m" testID="input-boom" /></View>
              <View style={{ flex: 1 }}><Input label="Pressure" value={f.pressure} onChangeText={(v) => setF({ ...f, pressure: v })} keyboardType="decimal-pad" suffix="bar" testID="input-pressure" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Nozzle" value={f.nozzle_type} onChangeText={(v) => setF({ ...f, nozzle_type: v })} testID="input-nozzle" /></View>
              <View style={{ flex: 1 }}><Input label="Spacing" value={f.nozzle_spacing_m} onChangeText={(v) => setF({ ...f, nozzle_spacing_m: v })} keyboardType="decimal-pad" suffix="m" testID="input-spacing" /></View>
            </View>
            <Input label="Start time" value={f.start_time} onChangeText={(v) => setF({ ...f, start_time: v })} testID="input-start" />
          </Card>

          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0 }]}>Starting Weather</Text>
            <Pressable onPress={captureWeather} disabled={loadingWeather} testID="capture-weather-btn"><Text style={styles.link}>{loadingWeather ? "…" : "↻ Recapture"}</Text></Pressable>
          </View>
          <Card>
            {weatherAt ? <Text style={styles.metaText}>Captured {new Date(weatherAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{gps.lat ? ` · ${gps.lat.toFixed(2)}, ${gps.lon!.toFixed(2)}` : ""}</Text> : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Temp" value={f.temperature_c} onChangeText={(v) => updateTempOrRh("temperature_c", v)} keyboardType="decimal-pad" suffix="°C" testID="input-temp-c" /></View>
              <View style={{ flex: 1 }}><Input label="RH" value={f.humidity} onChangeText={(v) => updateTempOrRh("humidity", v)} keyboardType="decimal-pad" suffix="%" testID="input-rh" /></View>
              <View style={{ flex: 1 }}><Input label="Delta T" value={f.delta_t} onChangeText={(v) => setF({ ...f, delta_t: v })} keyboardType="decimal-pad" testID="input-delta-t" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Wind" value={f.wind_speed} onChangeText={(v) => setF({ ...f, wind_speed: v })} keyboardType="decimal-pad" suffix="km/h" testID="input-wind" /></View>
              <View style={{ flex: 1 }}><Input label="Direction" value={f.wind_direction} onChangeText={(v) => setF({ ...f, wind_direction: v })} testID="input-wind-dir" /></View>
            </View>
            <Text style={styles.discl}>Values can be manually overridden with on-site measurements. Check current product label, weather conditions and local spraying requirements before application.</Text>
          </Card>

          <Text style={styles.section}>Tank mix</Text>
          <Card>
            <Text style={styles.chipLabel}>Tap to add from Chemical Register</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {chems.map((c) => (
                <Pressable key={c.id} onPress={() => addProduct(c)} style={styles.addChip} testID={`add-chem-${c.id}`}>
                  <Icon name="plus" size={14} color={colors.brandPrimary} />
                  <Text style={styles.addChipText} numberOfLines={1}>{c.product_name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {products.length === 0 ? (
              <Text style={styles.empty}>No products added yet.</Text>
            ) : (
              products.map((p, idx) => {
                const area = parseFloat(f.area_ha) || 0;
                let totalQty = 0;
                if (area > 0) totalQty = p.rate * area;
                const unitSuffix = p.unit === "%v/v" ? "L water" : p.unit.replace("/ha", "");
                return (
                  <View key={p.id} style={styles.productRow} testID={`spray-product-${idx}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>{p.chemical_name}</Text>
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }}>
                        <View style={{ width: 90 }}>
                          <Input label="" value={p.rateStr} onChangeText={(v) => updateProduct(p.id, { rateStr: v })} keyboardType="decimal-pad" testID={`prod-rate-${idx}`} />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {UNITS.map((u) => (
                            <Pressable key={u} onPress={() => updateProduct(p.id, { unit: u })} style={[styles.unitChip, p.unit === u && styles.unitChipActive]} testID={`prod-unit-${idx}-${u}`}>
                              <Text style={[styles.unitChipText, p.unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                      {area > 0 ? <Text style={styles.totalQty}>Total: {totalQty.toFixed(2)} {unitSuffix}</Text> : null}
                    </View>
                    <Pressable onPress={() => removeProduct(p.id)} testID={`remove-prod-${idx}`}><Icon name="close-circle" size={22} color={colors.error} /></Pressable>
                  </View>
                );
              })
            )}
          </Card>

          <Text style={styles.section}>Notes</Text>
          <Card>
            <Input label="" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-record-notes" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title={starting ? "Starting…" : "Start Job"} icon="play-circle" size="lg" onPress={startJob} loading={starting} testID="start-job-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save Draft" icon="content-save-outline" variant="secondary" onPress={saveDraft} testID="save-draft-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Cancel" variant="outline" onPress={() => router.back()} testID="cancel-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  chipLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  chipRow: { gap: 8, paddingVertical: 6 },
  addChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandSecondary, borderWidth: 1, borderColor: colors.brandPrimary },
  addChipText: { fontSize: 12, fontWeight: "700", color: colors.onBrandSecondary, maxWidth: 140 },
  productRow: { flexDirection: "row", gap: 12, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  unitChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  totalQty: { fontSize: 12, color: colors.brandPrimary, marginTop: 6, fontWeight: "700" },
  discl: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 17 },
  metaText: { fontSize: 12, color: colors.muted, marginBottom: 8, fontWeight: "600" },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 12, fontStyle: "italic" },
});
