import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { seedingRateKgHa, fmt, blendTotalForArea, type BlendUnit } from "@/src/lib/calculators";
import { v4 as uuid } from "uuid";
import type { Farm, Paddock, Operator, Machinery, SeedingJob, SeedingJobProduct, SeedingJobStatus } from "@/src/lib/types";

type Row = { id: string; name: string; rate: string; unit: BlendUnit };
const UNITS: BlendUnit[] = ["kg/ha", "L/ha", "g/ha", "Custom"];

export default function NewSeedingJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string; plannedId?: string }>();
  const sourceId = params.draft ?? params.plannedId ?? null;

  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<Machinery[]>([]);

  const [id] = useState(sourceId ?? uuid());
  const [farmId, setFarmId] = useState<string | undefined>();
  const [farmName, setFarmName] = useState<string | undefined>();
  const [paddockId, setPaddockId] = useState<string | undefined>();
  const [paddockName, setPaddockName] = useState<string | undefined>();
  const [crop, setCrop] = useState("");
  const [variety, setVariety] = useState("");
  const [operatorId, setOperatorId] = useState<string | undefined>();
  const [operatorName, setOperatorName] = useState<string | undefined>();
  const [machineryId, setMachineryId] = useState<string | undefined>();
  const [machineryName, setMachineryName] = useState<string | undefined>();
  const [areaHa, setAreaHa] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [targetPlants, setTargetPlants] = useState("150");
  const [tsw, setTsw] = useState("40");
  const [germination, setGermination] = useState("95");
  const [establishment, setEstablishment] = useState("85");
  const [rowSpacing, setRowSpacing] = useState("");
  const [sowingDepth, setSowingDepth] = useState("");

  const [products, setProducts] = useState<Row[]>([]);
  const [notes, setNotes] = useState("");

  const [weather, setWeather] = useState<{ t?: number; h?: number; ws?: number; wd?: string; at?: string; lat?: number; lon?: number } | null>(null);
  const [capturingWeather, setCapturingWeather] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.farms.active().then(setFarms).catch(() => {});
    repo.operators.active().then(setOperators).catch(() => {});
    repo.machinery.list().then((m) => setMachines(m.filter((x) => !x.archived_at))).catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale paddocks synchronously when the farm changes avoids a flash of the previous farm's paddocks while the new list loads.
    if (!farmId) { setPaddocks([]); return; }
    repo.paddocks.active().then((all) => setPaddocks(all.filter((p) => p.farm_id === farmId))).catch(() => {});
  }, [farmId]);

  // Resume a draft or planned job.
  useEffect(() => {
    if (!sourceId) return;
    repo.seedingJobs.get(sourceId).then((j) => {
      if (!j) return;
      setFarmId(j.farm_id); setFarmName(j.farm_name);
      setPaddockId(j.paddock_id); setPaddockName(j.paddock_name);
      setCrop(j.crop ?? ""); setVariety(j.variety ?? "");
      setOperatorId(j.operator_id); setOperatorName(j.operator);
      setMachineryId(j.machinery_id); setMachineryName(j.machinery_name);
      setAreaHa(j.area_ha != null ? String(j.area_ha) : "");
      setDate(j.date ?? new Date().toISOString().slice(0, 10));
      if (j.target_plants_m2 != null) setTargetPlants(String(j.target_plants_m2));
      if (j.tsw_g != null) setTsw(String(j.tsw_g));
      if (j.germination_pct != null) setGermination(String(j.germination_pct));
      if (j.establishment_pct != null) setEstablishment(String(j.establishment_pct));
      if (j.row_spacing_cm != null) setRowSpacing(String(j.row_spacing_cm));
      if (j.sowing_depth_mm != null) setSowingDepth(String(j.sowing_depth_mm));
      setProducts((j.products ?? []).map((p) => ({ id: p.id, name: p.chemical_name, rate: String(p.rate), unit: (p.unit as BlendUnit) ?? "kg/ha" })));
      setNotes(j.notes ?? "");
      if (j.temperature_c != null || j.soil_temp_c != null) {
        setWeather({ t: j.temperature_c, h: j.humidity, ws: j.wind_speed, wd: j.wind_direction, at: j.weather_captured_at, lat: j.gps_lat, lon: j.gps_lon });
      }
    }).catch(() => {});
  }, [sourceId]);

  const captureWeather = useCallback(async () => {
    setCapturingWeather(true);
    try {
      const w = await fetchWeather();
      setWeather({ t: w.temperature_c, h: w.humidity, ws: w.wind_speed, wd: w.wind_direction, at: w.captured_at, lat: w.lat, lon: w.lon });
    } catch {
      // Weather capture is best-effort — a missing reading shouldn't block the form.
    } finally {
      setCapturingWeather(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- same mount-time auto-capture kickoff as records/new.tsx's captureWeather() effect.
  useEffect(() => { captureWeather(); }, [captureWeather]);

  const seedRate = useMemo(
    () => seedingRateKgHa(parseFloat(targetPlants) || 0, parseFloat(tsw) || 0, parseFloat(germination) || 0, parseFloat(establishment) || 0),
    [targetPlants, tsw, germination, establishment],
  );

  const areaHaNum = parseFloat(areaHa) || 0;
  const productTotals = useMemo(
    () => products.map((r) => blendTotalForArea(parseFloat(r.rate) || 0, r.unit, areaHaNum)),
    [products, areaHaNum],
  );

  function pickFarm(f: Farm) { setFarmId(f.id); setFarmName(f.name); setPaddockId(undefined); setPaddockName(undefined); }
  function pickPaddock(p: Paddock) {
    setPaddockId(p.id); setPaddockName(p.name);
    if (p.area_ha != null) setAreaHa(String(p.area_ha));
    if (p.crop) setCrop(p.crop);
    if (p.variety) setVariety(p.variety);
  }
  function pickOperator(o: Operator) { setOperatorId(o.id); setOperatorName(o.name); }
  function pickMachine(m: Machinery) { setMachineryId(m.id); setMachineryName(m.name); }

  function addProduct() { setProducts((rs) => [...rs, { id: uuid(), name: "", rate: "1", unit: "kg/ha" }]); }
  function removeProduct(id: string) { setProducts((rs) => rs.filter((r) => r.id !== id)); }
  function updateProduct(id: string, patch: Partial<Row>) { setProducts((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); }

  function buildJob(status: SeedingJobStatus): SeedingJob {
    const businessId = ""; // filled by repo.seedingJobs.save via cloud-repo's bid(); harmless placeholder in local mode
    const jobProducts: SeedingJobProduct[] = products.map((r, i) => ({
      id: r.id,
      chemical_id: "",
      chemical_name: r.name || "Product",
      rate: parseFloat(r.rate) || 0,
      unit: r.unit as any,
      total_qty: productTotals[i]?.amount,
      total_qty_unit: productTotals[i]?.unit,
    }));
    return {
      id,
      business_id: businessId,
      status,
      farm_id: farmId, farm_name: farmName,
      paddock_id: paddockId, paddock_name: paddockName,
      crop: crop.trim() || undefined,
      variety: variety.trim() || undefined,
      date,
      operator_id: operatorId, operator: operatorName,
      machinery_id: machineryId, machinery_name: machineryName,
      area_ha: areaHaNum || undefined,
      target_plants_m2: parseFloat(targetPlants) || undefined,
      tsw_g: parseFloat(tsw) || undefined,
      germination_pct: parseFloat(germination) || undefined,
      establishment_pct: parseFloat(establishment) || undefined,
      seed_rate_kg_ha: seedRate || undefined,
      row_spacing_cm: parseFloat(rowSpacing) || undefined,
      sowing_depth_mm: parseFloat(sowingDepth) || undefined,
      temperature_c: weather?.t, humidity: weather?.h, wind_speed: weather?.ws, wind_direction: weather?.wd,
      weather_captured_at: weather?.at,
      gps_lat: weather?.lat, gps_lon: weather?.lon,
      notes: notes.trim() || undefined,
      products: jobProducts,
      created_at: new Date().toISOString(),
    };
  }

  const missingRequired = !farmId || !paddockId || !operatorId || !machineryId || !areaHaNum;

  async function startJob() {
    setError(null);
    if (missingRequired) { setError("Farm, paddock, operator, machine and area are all required to start a job."); return; }
    setSaving(true);
    try {
      const existing = await repo.seedingJobs.active();
      if (existing) { router.replace({ pathname: "/active-seeding-job/[id]", params: { id: existing.id } }); return; }
      await captureWeather();
      const job = buildJob("active");
      job.start_time = new Date().toTimeString().slice(0, 5);
      await repo.seedingJobs.save(job);
      router.replace({ pathname: "/active-seeding-job/[id]", params: { id: job.id } });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't start the job");
    } finally {
      setSaving(false);
    }
  }

  async function savePlanned() {
    setError(null);
    if (!date) { setError("A schedule date is required to save as planned."); return; }
    setSaving(true);
    try {
      await repo.seedingJobs.save(buildJob("planned"));
      router.replace("/(tabs)/seeding");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save as planned");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await repo.seedingJobs.save(buildJob("draft"));
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save draft", e?.message ?? "Please try again");
    } finally {
      setSaving(false);
    }
  }

  const paddocksForFarm = farmId ? paddocks.filter((p) => p.farm_id === farmId) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Seeding Job" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">

          {error ? (
            <View style={styles.errorBox}><Icon name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View>
          ) : null}

          <Text style={styles.section}>Location</Text>
          <Card>
            <Text style={styles.pickerLabel}>Farm{!farmId ? " *" : ""}</Text>
            <View style={styles.chipRow}>
              {farms.map((f) => <Chip key={f.id} label={f.name} active={farmId === f.id} onPress={() => pickFarm(f)} testID={`farm-${f.id}`} />)}
            </View>
            {farmId ? (
              <>
                <Text style={styles.pickerLabel}>Paddock{!paddockId ? " *" : ""}</Text>
                <View style={styles.chipRow}>
                  {paddocksForFarm.map((p) => <Chip key={p.id} label={p.name} active={paddockId === p.id} onPress={() => pickPaddock(p)} testID={`paddock-${p.id}`} />)}
                </View>
              </>
            ) : null}
            <Input label="Crop" value={crop} onChangeText={setCrop} testID="input-crop" />
            <Input label="Variety" value={variety} onChangeText={setVariety} testID="input-variety" />
            <Input label="Area to be sown" value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" suffix="ha" error={!areaHaNum} testID="input-area" />
            <Input label="Schedule date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="input-date" />
          </Card>

          <Text style={styles.section}>Operator</Text>
          <Card>
            <View style={styles.chipRow}>
              {operators.map((o) => <Chip key={o.id} label={o.name} active={operatorId === o.id} onPress={() => pickOperator(o)} testID={`operator-${o.id}`} />)}
            </View>
          </Card>

          <Text style={styles.section}>Machinery</Text>
          <Card>
            <View style={styles.chipRow}>
              {machines.map((m) => <Chip key={m.id} label={m.name} active={machineryId === m.id} onPress={() => pickMachine(m)} testID={`machine-${m.id}`} />)}
            </View>
          </Card>

          <Text style={styles.section}>Seeding Rate</Text>
          <Card>
            <Input label="Target plant density" value={targetPlants} onChangeText={setTargetPlants} keyboardType="decimal-pad" suffix="plants/m²" testID="input-target-plants" />
            <Input label="Thousand seed weight (TSW)" value={tsw} onChangeText={setTsw} keyboardType="decimal-pad" suffix="g" testID="input-tsw" />
            <Input label="Germination" value={germination} onChangeText={setGermination} keyboardType="decimal-pad" suffix="%" testID="input-germination" />
            <Input label="Establishment" value={establishment} onChangeText={setEstablishment} keyboardType="decimal-pad" suffix="%" testID="input-establishment" />
            <Input label="Row spacing (optional)" value={rowSpacing} onChangeText={setRowSpacing} keyboardType="decimal-pad" suffix="cm" testID="input-row-spacing" />
            <Input label="Sowing depth (optional)" value={sowingDepth} onChangeText={setSowingDepth} keyboardType="decimal-pad" suffix="mm" testID="input-sowing-depth" />
            <Text style={styles.calcLine}>Seed rate: <Text style={{ fontWeight: "800" }}>{fmt(seedRate, 1)} kg/ha</Text></Text>
          </Card>

          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0 }]}>Starting weather</Text>
            {capturingWeather ? <Text style={styles.link}>Capturing…</Text> : <Pressable onPress={captureWeather}><Text style={styles.link}>↻ Recapture</Text></Pressable>}
          </View>
          <Card>
            <Text style={styles.calcLine}>
              {weather?.t != null ? `${weather.t}°C` : "—"} · {weather?.h != null ? `${weather.h}% RH` : "—"} · {weather?.ws != null ? `${weather.ws} km/h ${weather.wd ?? ""}` : "—"}
            </Text>
          </Card>

          <Text style={styles.section}>Seed, fertiliser & treatment</Text>
          {products.map((r, idx) => (
            <Card key={r.id} style={{ marginBottom: spacing.md }} testID={`product-row-${idx}`}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowIdx}>Product {idx + 1}</Text>
                <Pressable onPress={() => removeProduct(r.id)} testID={`remove-product-${idx}`}>
                  <Icon name="close-circle" size={22} color={colors.error} />
                </Pressable>
              </View>
              <Input label="Product name" value={r.name} onChangeText={(t) => updateProduct(r.id, { name: t })} testID={`input-product-name-${idx}`} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Input label="Rate" value={r.rate} onChangeText={(t) => updateProduct(r.id, { rate: t })} keyboardType="decimal-pad" testID={`input-rate-${idx}`} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerLabel}>Unit</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {UNITS.map((u) => (
                      <Pressable key={u} onPress={() => updateProduct(r.id, { unit: u })} style={[styles.unitChip, r.unit === u && styles.unitChipActive]} testID={`unit-${idx}-${u}`}>
                        <Text style={[styles.unitChipText, r.unit === u && { color: colors.onBrandPrimary }]}>{u}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <Text style={styles.calcLine}>Total for paddock: <Text style={{ fontWeight: "800" }}>{fmt(productTotals[idx]?.amount ?? 0)} {productTotals[idx]?.unit}</Text></Text>
            </Card>
          ))}
          <Button title="Add product" icon="plus" variant="outline" onPress={addProduct} testID="add-product-btn" />

          <Text style={styles.section}>Notes</Text>
          <Card>
            <Input label="Notes" value={notes} onChangeText={setNotes} multiline testID="input-notes" />
          </Card>

          <View style={{ height: spacing.lg }} />
          <Button title="Start Job" icon="play-circle-outline" size="lg" onPress={startJob} loading={saving} disabled={saving} testID="start-job-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save as Planned" icon="calendar-clock" variant="outline" onPress={savePlanned} disabled={saving} testID="save-planned-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Save Draft" icon="content-save-outline" variant="ghost" onPress={saveDraft} disabled={saving} testID="save-draft-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  pickerLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  rowIdx: { fontSize: 13, fontWeight: "700", color: colors.muted },
  unitChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  unitChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  unitChipText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  calcLine: { marginTop: 6, fontSize: 14, color: colors.onSurface },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
