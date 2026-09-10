import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Modal, TextInput, FlatList, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { deltaT, nozzleFlowLpm, numNozzles, fmt, productTotalForJob, productPerTank } from "@/src/lib/calculators";
import { stagesForCrop, stageLabel } from "@/src/lib/crop-stages";
import type { Farm, Paddock, Machinery, Chemical, RateUnit, SprayJob, SprayJobProduct, SprayJobStatus, Operator } from "@/src/lib/types";
import { RATE_UNITS } from "@/src/lib/types";

const UNITS: RateUnit[] = RATE_UNITS;
const REQUIRED = ["farm_id", "paddock_id", "operator_id", "machinery_id", "area_ha", "water_rate"] as const;

// Dedupe list by display name (guards against legacy re-seeded duplicates).
function uniqueByName<T extends { name: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = x.name.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export default function NewSprayJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string; plannedId?: string; paddockId?: string }>();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [machs, setMachs] = useState<Machinery[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [chems, setChems] = useState<Chemical[]>([]);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [starting, setStarting] = useState(false);
  const [products, setProducts] = useState<(SprayJobProduct & { rateStr: string })[]>([]);
  const [gps, setGps] = useState<{ lat?: number; lon?: number }>({});
  const [weatherAt, setWeatherAt] = useState<string | undefined>();
  const [autoWeather, setAutoWeather] = useState<{ t?: number; h?: number; dt?: number; ws?: number; wd?: string }>({});
  const [weatherEdited, setWeatherEdited] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [showMissing, setShowMissing] = useState<Record<string, boolean>>({});

  const [f, setF] = useState({
    farm_id: "", farm_name: "", paddock_id: "", paddock_name: "",
    crop: "", variety: "", target: "",
    crop_stage: "", crop_stage_custom: "",
    operator_id: "", operator_name: "",
    machinery_id: "", machinery_name: "",
    area_ha: "", water_rate: "", speed_kmh: "",
    boom_width_m: "", nozzle_type: "", nozzle_spacing_m: "", pressure: "3",
    start_time: new Date().toTimeString().slice(0, 5),
    temperature_c: "", humidity: "", delta_t: "",
    wind_speed: "", wind_direction: "",
    notes: "",
  });

  useFocusEffect(useCallback(() => {
    (async () => {
      const [fa, pa, ma, ch, op] = await Promise.all([
        repo.farms.active(), repo.paddocks.active(), repo.machinery.list(), repo.chemicals.active(), repo.operators.active(),
      ]);
      setFarms(fa); setPaddocks(pa); setMachs(ma); setChems(ch); setOperators(op);
      // Default operator to current user, only if not already set / no draft loaded
      setF((s) => {
        if (s.operator_id) return s;
        const def = op.find((o) => o.is_default_user);
        if (!def) return s;
        return { ...s, operator_id: def.id, operator_name: def.name };
      });
    })();
  }, []));

  // Draft resume
  useEffect(() => {
    (async () => {
      const sourceId = (params.plannedId as string) || (params.draft as string);
      if (!sourceId) return;
      const draft = await repo.sprayJobs.get(sourceId);
      if (!draft) return;
      setF((s) => ({
        ...s,
        farm_id: draft.farm_id ?? "", farm_name: draft.farm_name ?? "",
        paddock_id: draft.paddock_id ?? "", paddock_name: draft.paddock_name ?? "",
        crop: draft.crop ?? "", variety: draft.variety ?? "", target: draft.target ?? "",
        crop_stage: draft.crop_stage ?? "", crop_stage_custom: draft.crop_stage_custom ?? "",
        operator_id: draft.operator_id ?? s.operator_id, operator_name: draft.operator ?? s.operator_name,
        machinery_id: draft.machinery_id ?? "", machinery_name: draft.machinery_name ?? "",
        area_ha: draft.area_ha?.toString() ?? "",
        water_rate: draft.water_rate?.toString() ?? "",
        speed_kmh: draft.speed_kmh?.toString() ?? "",
        boom_width_m: draft.boom_width_m?.toString() ?? "",
        nozzle_type: draft.nozzle_type ?? "",
        nozzle_spacing_m: draft.nozzle_spacing_m != null ? (draft.nozzle_spacing_m * 1000).toString() : "",
        pressure: draft.pressure?.toString() ?? "3",
        start_time: draft.start_time ?? s.start_time,
        notes: draft.notes ?? "",
      }));
      setProducts(draft.products.map((p) => ({ ...p, rateStr: p.rate.toString() })));
    })();
  }, [params.draft, params.plannedId]);

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
      setAutoWeather({ t: w.temperature_c, h: w.humidity, dt: w.delta_t, ws: w.wind_speed, wd: w.wind_direction });
      setWeatherEdited(false);
      setGps({ lat: w.lat, lon: w.lon });
      setWeatherAt(w.captured_at);
    } catch (e) { console.warn(e); }
    finally { setLoadingWeather(false); }
  }

  function editWeather<K extends "temperature_c" | "humidity" | "wind_speed" | "wind_direction" | "delta_t">(field: K, val: string) {
    setF((s) => {
      const next = { ...s, [field]: val };
      if (field === "temperature_c" || field === "humidity") {
        const t = parseFloat(next.temperature_c);
        const h = parseFloat(next.humidity);
        if (!isNaN(t) && !isNaN(h)) next.delta_t = deltaT(t, h).toFixed(1);
      }
      return next;
    });
    setWeatherEdited(true);
  }

  function pickFarm(farm: Farm) {
    setF((s) => ({ ...s, farm_id: farm.id, farm_name: farm.name, paddock_id: "", paddock_name: "", crop: "", variety: "", area_ha: "" }));
  }
  function pickPaddock(p: Paddock) {
    setF((s) => ({
      ...s,
      paddock_id: p.id, paddock_name: p.name,
      crop: p.crop ?? s.crop,
      variety: p.variety ?? s.variety,
      area_ha: p.area_ha != null ? p.area_ha.toString() : s.area_ha,
    }));
  }
  function pickOperator(o: Operator) {
    setF((s) => ({ ...s, operator_id: o.id, operator_name: o.name }));
  }
  function pickMachine(m: Machinery) {
    setF((s) => ({
      ...s,
      machinery_id: m.id, machinery_name: m.name,
      boom_width_m: m.boom_width_m != null ? m.boom_width_m.toString() : s.boom_width_m,
      nozzle_spacing_m: m.nozzle_spacing_m != null ? (m.nozzle_spacing_m * 1000).toString() : s.nozzle_spacing_m,
      nozzle_type: m.default_nozzle ?? s.nozzle_type,
      speed_kmh: m.default_speed_kmh != null ? m.default_speed_kmh.toString() : s.speed_kmh,
      water_rate: m.default_water_rate_lha != null ? m.default_water_rate_lha.toString() : s.water_rate,
    }));
  }

  function addProduct(c: Chemical) {
    setProducts((ps) => [
      ...ps,
      { id: uuid(), chemical_id: c.id, chemical_name: c.product_name,
        rate: c.default_rate ?? 0, rateStr: c.default_rate ? c.default_rate.toString() : "",
        unit: (c.default_unit as RateUnit) ?? "L/ha" },
    ]);
    setShowPicker(false);
    setPickerQuery("");
  }
  function updateProduct(id: string, patch: Partial<SprayJobProduct & { rateStr: string }>) {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, rate: patch.rateStr !== undefined ? parseFloat(patch.rateStr) || 0 : p.rate } : p)));
  }
  function removeProduct(id: string) { setProducts((ps) => ps.filter((p) => p.id !== id)); }

  const farmPaddocks = uniqueByName(paddocks.filter((p) => p.farm_id === f.farm_id));
  const uniqueFarms = uniqueByName(farms);
  const uniqueOperators = uniqueByName(operators);
  const uniqueMachs = uniqueByName(machs);
  const filteredChems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return chems;
    return chems.filter((c) =>
      c.product_name.toLowerCase().includes(q) ||
      (c.active_ingredient ?? "").toLowerCase().includes(q) ||
      (c.apvma_number ?? "").includes(q),
    );
  }, [chems, pickerQuery]);

  // Live calculations
  const calc = useMemo(() => {
    const rate = parseFloat(f.water_rate) || 0;
    const speed = parseFloat(f.speed_kmh) || 0;
    const spacingMm = parseFloat(f.nozzle_spacing_m) || 0;
    const spacingM = spacingMm / 1000;
    const boom = parseFloat(f.boom_width_m) || 0;
    const nozzle = spacingM > 0 ? nozzleFlowLpm(rate, speed, spacingM) : 0;
    const selectedMach = machs.find((m) => m.id === f.machinery_id);
    const activeN = selectedMach?.nozzle_positions ?? (spacingM > 0 ? Math.round(boom / spacingM) : 0);
    return { nozzle, nn: activeN, total: nozzle * activeN };
  }, [f.water_rate, f.speed_kmh, f.nozzle_spacing_m, f.boom_width_m, f.machinery_id, machs]);

  function missing(field: (typeof REQUIRED)[number]): boolean {
    const v = (f as any)[field];
    return showMissing[field] === true && !v;
  }

  function buildJob(status: SprayJobStatus): SprayJob {
    const area = parseFloat(f.area_ha) || 0;
    return {
      id: (params.plannedId as string) || (params.draft as string) || uuid(),
      business_id: "",
      status,
      farm_id: f.farm_id || undefined, farm_name: f.farm_name || undefined,
      paddock_id: f.paddock_id || undefined, paddock_name: f.paddock_name || undefined,
      crop: f.crop || undefined, variety: f.variety || undefined, target: f.target || undefined,
      crop_stage: f.crop_stage || undefined,
      crop_stage_custom: (f.crop_stage === "other" || f.crop_stage === "custom") ? (f.crop_stage_custom || undefined) : undefined,
      date: new Date().toISOString().slice(0, 10),
      start_time: f.start_time || undefined,
      operator_id: f.operator_id || undefined, operator: f.operator_name || undefined,
      machinery_id: f.machinery_id || undefined, machinery_name: f.machinery_name || undefined,
      area_ha: area || undefined,
      water_rate: parseFloat(f.water_rate) || undefined,
      speed_kmh: parseFloat(f.speed_kmh) || undefined,
      boom_width_m: parseFloat(f.boom_width_m) || undefined,
      nozzle_type: f.nozzle_type || undefined,
      nozzle_spacing_m: f.nozzle_spacing_m ? parseFloat(f.nozzle_spacing_m) / 1000 : undefined,
      pressure: parseFloat(f.pressure) || undefined,
      temperature_c: parseFloat(f.temperature_c) || undefined,
      humidity: parseFloat(f.humidity) || undefined,
      delta_t: parseFloat(f.delta_t) || undefined,
      wind_speed: parseFloat(f.wind_speed) || undefined,
      wind_direction: f.wind_direction || undefined,
      weather_captured_at: weatherAt,
      temperature_c_auto: autoWeather.t,
      humidity_auto: autoWeather.h,
      delta_t_auto: autoWeather.dt,
      wind_speed_auto: autoWeather.ws,
      wind_direction_auto: autoWeather.wd,
      weather_edited: weatherEdited,
      gps_lat: gps.lat, gps_lon: gps.lon,
      notes: f.notes || undefined,
      products: products.map((p) => {
        const area = parseFloat(f.area_ha) || 0;
        const water = parseFloat(f.water_rate) || 0;
        const t = productTotalForJob(p.rate, p.unit, area, water, p.custom_unit_label);
        return {
          id: p.id, chemical_id: p.chemical_id, chemical_name: p.chemical_name,
          rate: p.rate, unit: p.unit, custom_unit_label: p.custom_unit_label,
          total_qty: area > 0 ? t.amount : undefined,
          total_qty_unit: area > 0 ? t.unit : undefined,
        };
      }),
      created_at: new Date().toISOString(),
    };
  }

  function validate(): boolean {
    const miss: Record<string, boolean> = {};
    for (const k of REQUIRED) if (!(f as any)[k]) miss[k] = true;
    setShowMissing(miss);
    return Object.keys(miss).length === 0;
  }

  async function startJob() {
    if (!validate()) return;
    const business = await repo.getBusiness();
    if (!business) return;
    const existing = await repo.sprayJobs.active();
    if (existing) {
      router.replace({ pathname: "/active-job/[id]", params: { id: existing.id } });
      return;
    }
    setStarting(true);
    try { await captureWeather(); } catch {}
    const job = buildJob("active");
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
    job.business_id = business.id;
    await repo.sprayJobs.save(job);
    router.back();
  }

  async function savePlanned() {
    const business = await repo.getBusiness();
    if (!business) return;
    const job = buildJob("planned");
    job.business_id = business.id;
    await repo.sprayJobs.save(job);
    router.replace("/spray");
  }

  const missingCount = Object.values(showMissing).filter(Boolean).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Spray Job" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom + 100 }} keyboardShouldPersistTaps="handled">

          {missingCount > 0 && (
            <View style={styles.errorBanner} testID="validation-banner">
              <Icon name="alert-circle" size={18} color={colors.onError} />
              <Text style={styles.errorBannerText}>Fill in the {missingCount} required field{missingCount === 1 ? "" : "s"} highlighted below.</Text>
            </View>
          )}

          <Text style={styles.section}>Location</Text>
          <Card style={showMissing.farm_id || showMissing.paddock_id ? styles.errorCard : undefined}>
            <Text style={[styles.pickerLabel, (showMissing.farm_id && !f.farm_id) && { color: colors.error }]}>Farm*</Text>
            {farms.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No farms saved yet.</Text>
                <Pressable onPress={() => router.push("/farms/new")} testID="add-farm-inline"><Text style={styles.link}>+ Add a farm</Text></Pressable>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {uniqueFarms.map((fa) => (
                  <Chip key={fa.id} label={fa.name} active={f.farm_id === fa.id} onPress={() => pickFarm(fa)} testID={`farm-chip-${fa.id}`} />
                ))}
              </ScrollView>
            )}

            {f.farm_id ? (
              <>
                <Text style={[styles.pickerLabel, (showMissing.paddock_id && !f.paddock_id) && { color: colors.error }]}>Paddock*</Text>
                {farmPaddocks.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No paddocks in this farm.</Text>
                    <Pressable onPress={() => router.push({ pathname: "/farms/paddock-new", params: { farmId: f.farm_id } })} testID="add-paddock-inline"><Text style={styles.link}>+ Add a paddock</Text></Pressable>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {farmPaddocks.map((p) => (
                      <Chip key={p.id} label={p.name} active={f.paddock_id === p.id} onPress={() => pickPaddock(p)} testID={`paddock-chip-${p.id}`} />
                    ))}
                  </ScrollView>
                )}
              </>
            ) : null}

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Crop" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} testID="input-crop" /></View>
              <View style={{ flex: 1 }}><Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="input-variety" /></View>
            </View>
            <Input label="Target weed / pest" value={f.target} onChangeText={(v) => setF({ ...f, target: v })} testID="input-target" />

            {/* Crop growth stage — chosen list depends on the crop, custom entry always available. */}
            <Text style={styles.pickerLabel}>Crop stage</Text>
            {(() => {
              const { stages, group } = stagesForCrop(f.crop);
              return (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} testID="crop-stage-chips">
                    {stages.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.hint ? `${s.label} · ${s.hint}` : s.label}
                        active={f.crop_stage === s.id}
                        onPress={() => setF({ ...f, crop_stage: s.id })}
                        testID={`crop-stage-${s.id}`}
                      />
                    ))}
                  </ScrollView>
                  {(f.crop_stage === "other" || f.crop_stage === "custom") ? (
                    <Input
                      label="Custom stage description"
                      value={f.crop_stage_custom}
                      onChangeText={(v) => setF({ ...f, crop_stage_custom: v })}
                      placeholder="e.g. GS30 boot, pre-swath, early bud"
                      testID="crop-stage-custom-input"
                    />
                  ) : null}
                  <Text style={styles.overrideHint}>{group} stage list — pick "Other" to enter your own.</Text>
                </>
              );
            })()}

            <Input label="Area to be treated" value={f.area_ha} onChangeText={(v) => { setF({ ...f, area_ha: v }); if (v) setShowMissing((s) => ({ ...s, area_ha: false })); }} keyboardType="decimal-pad" suffix="ha" testID="input-area" error={missing("area_ha")} />
            {f.paddock_id ? <Text style={styles.overrideHint}>Auto-filled from paddock — you can override for this job without changing the paddock record.</Text> : null}
          </Card>

          <Text style={styles.section}>Operator</Text>
          <Card style={missing("operator_id") ? styles.errorCard : undefined}>
            <Text style={[styles.pickerLabel, missing("operator_id") && { color: colors.error }]}>Operator*</Text>
            {operators.length === 0 ? (
              <Text style={styles.emptyText}>No operators saved yet. Go to More → Farms & Paddocks structure to add one later.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {uniqueOperators.map((o) => (
                  <Chip
                    key={o.id}
                    label={o.name + (o.is_default_user ? " · you" : "")}
                    active={f.operator_id === o.id}
                    onPress={() => pickOperator(o)}
                    testID={`operator-chip-${o.id}`}
                  />
                ))}
              </ScrollView>
            )}
          </Card>

          <Text style={styles.section}>Machinery</Text>
          <Card style={missing("machinery_id") ? styles.errorCard : undefined}>
            <Text style={[styles.pickerLabel, missing("machinery_id") && { color: colors.error }]}>Machine / sprayer*</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {uniqueMachs.map((m) => (
                <Chip key={m.id} label={m.name} active={f.machinery_id === m.id} onPress={() => pickMachine(m)} testID={`mach-chip-${m.id}`} />
              ))}
            </ScrollView>
            {f.machinery_id ? <Text style={styles.overrideHint}>Boom, spacing, nozzle, speed and water rate auto-filled from the machine profile — you can override just for this job.</Text> : null}
          </Card>

          <Text style={styles.section}>Application setup</Text>
          <Card>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input label="Water rate" value={f.water_rate} onChangeText={(v) => { setF({ ...f, water_rate: v }); if (v) setShowMissing((s) => ({ ...s, water_rate: false })); }} keyboardType="decimal-pad" suffix="L/ha" testID="input-water" error={missing("water_rate")} />
              </View>
              <View style={{ flex: 1 }}><Input label="Speed" value={f.speed_kmh} onChangeText={(v) => setF({ ...f, speed_kmh: v })} keyboardType="decimal-pad" suffix="km/h" testID="input-speed" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Boom width" value={f.boom_width_m} onChangeText={(v) => setF({ ...f, boom_width_m: v })} keyboardType="decimal-pad" suffix="m" testID="input-boom" /></View>
              <View style={{ flex: 1 }}><Input label="Pressure" value={f.pressure} onChangeText={(v) => setF({ ...f, pressure: v })} keyboardType="decimal-pad" suffix="bar" testID="input-pressure" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Nozzle" value={f.nozzle_type} onChangeText={(v) => setF({ ...f, nozzle_type: v })} testID="input-nozzle" /></View>
              <View style={{ flex: 1 }}><Input label="Nozzle spacing" value={f.nozzle_spacing_m} onChangeText={(v) => setF({ ...f, nozzle_spacing_m: v })} keyboardType="decimal-pad" suffix="mm" testID="input-spacing" /></View>
            </View>
            <Input label="Start time" value={f.start_time} onChangeText={(v) => setF({ ...f, start_time: v })} testID="input-start" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Card style={{ backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary }} testID="live-calc-card">
            <Text style={styles.calcTitle}>Live application calc</Text>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>Nozzle flow</Text><Text style={styles.calcValue}>{fmt(calc.nozzle)} L/min</Text></View>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>Active nozzles</Text><Text style={styles.calcValue}>{calc.nn}</Text></View>
            <View style={styles.calcRow}><Text style={styles.calcLabel}>Total boom flow</Text><Text style={styles.calcValue}>{fmt(calc.total)} L/min</Text></View>
            <Text style={styles.calcFormula}>L/min per nozzle = L/ha × km/h × spacing ÷ 600</Text>
          </Card>

          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0 }]}>Weather</Text>
            <Pressable onPress={captureWeather} disabled={loadingWeather} testID="capture-weather-btn"><Text style={styles.link}>{loadingWeather ? "…" : "↻ Recapture"}</Text></Pressable>
          </View>
          <Card>
            {weatherAt ? (
              <View style={styles.wxMeta} testID="wx-meta">
                <Icon name="clock-outline" size={13} color={colors.muted} />
                <Text style={styles.wxMetaText}>Captured at {new Date(weatherAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{gps.lat ? ` · GPS ${gps.lat.toFixed(3)}, ${gps.lon!.toFixed(3)}` : ""}</Text>
                {weatherEdited ? <View style={styles.editedBadge}><Text style={styles.editedBadgeText}>Edited</Text></View> : null}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Temp" value={f.temperature_c} onChangeText={(v) => editWeather("temperature_c", v)} keyboardType="decimal-pad" suffix="°C" testID="input-temp-c" /></View>
              <View style={{ flex: 1 }}><Input label="RH" value={f.humidity} onChangeText={(v) => editWeather("humidity", v)} keyboardType="decimal-pad" suffix="%" testID="input-rh" /></View>
              <View style={{ flex: 1 }}><Input label="Delta T" value={f.delta_t} onChangeText={(v) => editWeather("delta_t", v)} keyboardType="decimal-pad" testID="input-delta-t" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Wind" value={f.wind_speed} onChangeText={(v) => editWeather("wind_speed", v)} keyboardType="decimal-pad" suffix="km/h" testID="input-wind" /></View>
              <View style={{ flex: 1 }}><Input label="Direction" value={f.wind_direction} onChangeText={(v) => editWeather("wind_direction", v)} testID="input-wind-dir" /></View>
            </View>
            <Text style={styles.discl}>Original automatic values are saved alongside any manual edits for the audit trail. Check current product label, weather conditions and local spraying requirements before application.</Text>
          </Card>

          <Text style={styles.section}>Tank mix</Text>
          <Card>
            <Pressable onPress={() => setShowPicker(true)} style={styles.addProductBtn} testID="add-product-btn">
              <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
              <Text style={styles.addProductText}>Add Product from Chemical Register</Text>
            </Pressable>

            {products.length === 0 ? (
              <Text style={styles.emptyProducts}>No products added yet. Rates are only entered by you — Chaser never recommends application rates.</Text>
            ) : (
              products.map((p, idx) => {
                const area = parseFloat(f.area_ha) || 0;
                const water = parseFloat(f.water_rate) || 0;
                const total = area > 0 ? productTotalForJob(p.rate, p.unit, area, water, p.custom_unit_label) : { amount: 0, unit: "" };
                return (
                  <View key={p.id} style={styles.productCard} testID={`spray-product-${idx}`}>
                    <View style={styles.productHeader}>
                      <Text style={styles.pName}>{p.chemical_name}</Text>
                      <Pressable onPress={() => removeProduct(p.id)} testID={`remove-prod-${idx}`} hitSlop={8}>
                        <Icon name="close-circle" size={22} color={colors.error} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 6 }}>
                      <View style={{ width: 100 }}>
                        <Input label="Rate" value={p.rateStr} onChangeText={(v) => updateProduct(p.id, { rateStr: v })} keyboardType="decimal-pad" testID={`prod-rate-${idx}`} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerLabel}>Unit</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {UNITS.map((u) => (
                            <Pressable key={u} onPress={() => updateProduct(p.id, { unit: u })} style={[styles.unitChip, p.unit === u && styles.unitChipActive]} testID={`prod-unit-${idx}-${u}`}>
                              <Text style={[styles.unitChipText, p.unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    </View>
                    {p.unit === "Custom" ? (
                      <Input label="Custom unit label" value={p.custom_unit_label ?? ""} onChangeText={(v) => updateProduct(p.id, { custom_unit_label: v })} placeholder="e.g. tabs/ha" testID={`prod-custom-unit-${idx}`} />
                    ) : null}
                    <Text style={styles.totalQty}>
                      Total for {area || "—"} ha: <Text style={{ fontWeight: "800" }}>{area > 0 ? `${fmt(total.amount)} ${total.unit}` : "—"}</Text>
                    </Text>
                  </View>
                );
              })
            )}
          </Card>

          {/* Tank Capacity summary */}
          {(() => {
            const selectedMach = machs.find((m) => m.id === f.machinery_id);
            const tank = selectedMach?.tank_capacity_l ?? 0;
            const area = parseFloat(f.area_ha) || 0;
            const water = parseFloat(f.water_rate) || 0;
            if (!tank || !area || !water) return null;
            const totalVolume = area * water;
            const haPerTank = tank / water;
            const fullTanks = Math.floor(totalVolume / tank);
            const partial = totalVolume - fullTanks * tank;
            return (
              <>
                <Text style={styles.section}>Tank capacity</Text>
                <Card testID="tank-capacity-card">
                  <View style={styles.tankRow}><Text style={styles.tankLabel}>Sprayer tank</Text><Text style={styles.tankValue}>{fmt(tank, 0)} L</Text></View>
                  <View style={styles.tankRow}><Text style={styles.tankLabel}>Total spray volume for job</Text><Text style={styles.tankValue}>{fmt(totalVolume, 0)} L</Text></View>
                  <View style={styles.tankRow}><Text style={styles.tankLabel}>Hectares per full tank</Text><Text style={styles.tankValue}>{fmt(haPerTank)} ha</Text></View>
                  <View style={styles.tankRow}><Text style={styles.tankLabel}>Tanks required</Text><Text style={styles.tankValue}>{fullTanks} full{partial > 0 ? ` + ${fmt(partial, 0)} L partial` : ""}</Text></View>
                  {products.length > 0 ? (
                    <>
                      <View style={styles.tankDivider} />
                      <Text style={styles.tankSub}>Per full tank</Text>
                      {products.map((p) => {
                        const pt = productPerTank(p.rate, p.unit, tank, water, p.custom_unit_label);
                        return (
                          <View key={p.id} style={styles.tankRow}>
                            <Text style={styles.tankLabel} numberOfLines={1}>{p.chemical_name}</Text>
                            <Text style={styles.tankValue}>{fmt(pt.amount)} {pt.unit}</Text>
                          </View>
                        );
                      })}
                    </>
                  ) : null}
                </Card>
              </>
            );
          })()}

          <Text style={styles.section}>Notes</Text>
          <Card>
            <Input label="" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-record-notes" />
          </Card>

          <View style={{ height: spacing.md }} />
          <Button title={starting ? "Starting…" : "Start Job"} icon="play-circle" size="lg" onPress={startJob} loading={starting} testID="start-job-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save as Planned" icon="calendar-clock" variant="outline" onPress={savePlanned} testID="save-planned-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save Draft" icon="content-save-outline" variant="secondary" onPress={saveDraft} testID="save-draft-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Cancel" variant="outline" onPress={() => router.back()} testID="cancel-btn" />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
          <ScreenHeader title="Add Product" right={
            <Pressable onPress={() => setShowPicker(false)} testID="picker-close-btn"><Icon name="close" size={24} color={colors.onSurface} /></Pressable>
          } />
          <View style={{ padding: spacing.lg }}>
            <View style={styles.searchWrap}>
              <Icon name="magnify" size={20} color={colors.muted} />
              <TextInput
                value={pickerQuery}
                onChangeText={setPickerQuery}
                placeholder="Search Chemical Register"
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoFocus
                testID="picker-search"
              />
            </View>
          </View>
          <FlatList
            data={filteredChems}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
            ListEmptyComponent={
              <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
                <Icon name="magnify-close" size={40} color={colors.muted} />
                <Text style={[styles.emptyProducts, { textAlign: "center", marginTop: 8 }]}>No matching products in your Chemical Register.</Text>
                <View style={{ height: spacing.md, alignSelf: "stretch" }} />
                <View style={{ alignSelf: "stretch", gap: spacing.sm }}>
                  <Button
                    title="Add New Chemical"
                    icon="plus"
                    onPress={() => { setShowPicker(false); setPickerQuery(""); router.push("/chemicals/new"); }}
                    testID="picker-add-new-chem"
                  />
                  <Button
                    title="Search APVMA Register"
                    icon="magnify"
                    variant="outline"
                    onPress={() => Linking.openURL(`https://portal.apvma.gov.au/pubcris?query=${encodeURIComponent(pickerQuery)}`)}
                    testID="picker-apvma-search"
                  />
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, fontStyle: "italic", marginTop: spacing.md, textAlign: "center", paddingHorizontal: 12 }}>
                  Live APVMA lookup is on the roadmap. Chaser never fabricates product information.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => addProduct(item)} testID={`picker-chem-${item.id}`} style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                <View style={styles.pickerIconBox}><Icon name="flask-outline" size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName}>{item.product_name}</Text>
                  {item.active_ingredient ? <Text style={styles.pickerAi}>{item.active_ingredient}</Text> : null}
                  <Text style={styles.pickerMeta}>
                    {item.apvma_number ? `APVMA ${item.apvma_number}` : ""}
                    {item.default_rate ? `${item.apvma_number ? " · " : ""}Default ${item.default_rate} ${item.default_unit}` : ""}
                  </Text>
                </View>
                <Icon name="plus-circle" size={22} color={colors.brandPrimary} />
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  pickerLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  chipRow: { gap: 8, paddingVertical: 6, paddingBottom: spacing.sm },
  emptyState: { paddingVertical: 8, alignItems: "flex-start" },
  emptyText: { color: colors.muted, fontSize: 13 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.error, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  errorBannerText: { color: colors.onError, fontWeight: "700", fontSize: 13, flex: 1 },
  errorCard: { borderColor: colors.error, borderWidth: 1.5 },
  overrideHint: { fontSize: 11, color: colors.muted, fontStyle: "italic", marginTop: -4, marginBottom: 4, lineHeight: 15 },
  addProductBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandSecondary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, marginBottom: spacing.md },
  addProductText: { color: colors.onBrandSecondary, fontWeight: "700", fontSize: 14, flex: 1 },
  emptyProducts: { color: colors.muted, fontStyle: "italic", fontSize: 13, paddingVertical: 8, lineHeight: 18 },
  productCard: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  productHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pName: { fontSize: 15, fontWeight: "700", color: colors.onSurface, flex: 1, paddingRight: 8 },
  unitChip: { paddingHorizontal: 12, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  totalQty: { fontSize: 12, color: colors.brandPrimary, marginTop: 8, fontWeight: "700" },
  calcTitle: { fontSize: 13, fontWeight: "800", color: colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.sm },
  calcRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  calcLabel: { fontSize: 14, color: colors.onBrandSecondary, fontWeight: "600" },
  calcValue: { fontSize: 16, color: colors.onBrandSecondary, fontWeight: "800" },
  calcFormula: { fontSize: 11, color: colors.onBrandSecondary, opacity: 0.75, marginTop: 8, fontStyle: "italic", textAlign: "center" },
  wxMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  wxMetaText: { fontSize: 12, color: colors.muted, fontWeight: "600", flex: 1 },
  editedBadge: { backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  editedBadgeText: { fontSize: 10, color: colors.warning, fontWeight: "800", textTransform: "uppercase" },
  discl: { fontSize: 11, color: colors.muted, marginTop: 6, lineHeight: 15 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerIconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  pickerName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pickerAi: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  pickerMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  tankRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, gap: 8 },
  tankLabel: { fontSize: 13, color: colors.muted, fontWeight: "600", flex: 1 },
  tankValue: { fontSize: 15, color: colors.onSurface, fontWeight: "800" },
  tankDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  tankSub: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
});
