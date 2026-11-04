import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Modal, TextInput, FlatList, Linking, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { fetchWeather } from "@/src/lib/weather";
import { rateTotalForArea, fmt } from "@/src/lib/calculators";
import type { Farm, Paddock, Operator, Machinery, Chemical, RateUnit, SpreadJob, SpreadJobProduct, SpreadJobStatus } from "@/src/lib/types";
import { RATE_UNITS } from "@/src/lib/types";

export default function NewSpreadJob() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ draft?: string; plannedId?: string }>();
  const sourceId = params.draft ?? params.plannedId ?? null;

  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<Machinery[]>([]);
  const [chems, setChems] = useState<Chemical[]>([]);

  const [id] = useState(sourceId ?? uuid());
  const [farmId, setFarmId] = useState<string | undefined>();
  const [farmName, setFarmName] = useState<string | undefined>();
  const [paddockId, setPaddockId] = useState<string | undefined>();
  const [paddockName, setPaddockName] = useState<string | undefined>();
  const [crop, setCrop] = useState("");
  const [variety, setVariety] = useState("");
  const [target, setTarget] = useState("");
  const [operatorId, setOperatorId] = useState<string | undefined>();
  const [operatorName, setOperatorName] = useState<string | undefined>();
  const [machineryId, setMachineryId] = useState<string | undefined>();
  const [machineryName, setMachineryName] = useState<string | undefined>();
  const [areaHa, setAreaHa] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const [speedKmh, setSpeedKmh] = useState("");
  const [spreadWidth, setSpreadWidth] = useState("");

  const [products, setProducts] = useState<(SpreadJobProduct & { rateStr: string })[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [notes, setNotes] = useState("");

  const [weather, setWeather] = useState<{ t?: number; h?: number; ws?: number; wd?: string; at?: string; lat?: number; lon?: number } | null>(null);
  const [capturingWeather, setCapturingWeather] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.farms.active().then(setFarms).catch(() => {});
    repo.operators.active().then(setOperators).catch(() => {});
    repo.machinery.list().then((m) => setMachines(m.filter((x) => !x.archived_at))).catch(() => {});
    repo.chemicals.active().then(setChems).catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale paddocks synchronously when the farm changes avoids a flash of the previous farm's paddocks while the new list loads.
    if (!farmId) { setPaddocks([]); return; }
    repo.paddocks.active().then((all) => setPaddocks(all.filter((p) => p.farm_id === farmId))).catch(() => {});
  }, [farmId]);

  // Resume a draft or planned job.
  useEffect(() => {
    if (!sourceId) return;
    repo.spreadJobs.get(sourceId).then((j) => {
      if (!j) return;
      setFarmId(j.farm_id); setFarmName(j.farm_name);
      setPaddockId(j.paddock_id); setPaddockName(j.paddock_name);
      setCrop(j.crop ?? ""); setVariety(j.variety ?? ""); setTarget(j.target ?? "");
      setOperatorId(j.operator_id); setOperatorName(j.operator);
      setMachineryId(j.machinery_id); setMachineryName(j.machinery_name);
      setAreaHa(j.area_ha != null ? String(j.area_ha) : "");
      setDate(j.date ?? new Date().toISOString().slice(0, 10));
      if (j.speed_kmh != null) setSpeedKmh(String(j.speed_kmh));
      if (j.spread_width_m != null) setSpreadWidth(String(j.spread_width_m));
      setProducts((j.products ?? []).map((p) => ({ ...p, rateStr: p.rate.toString() })));
      setNotes(j.notes ?? "");
      if (j.temperature_c != null) {
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

  const areaHaNum = parseFloat(areaHa) || 0;
  const productTotals = useMemo(
    () => products.map((p) => rateTotalForArea(p.rate, p.unit, areaHaNum, p.custom_unit_label)),
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

  function addProduct(c: Chemical) {
    const newProduct: SpreadJobProduct & { rateStr: string } = {
      id: uuid(), chemical_id: c.id, chemical_name: c.product_name,
      chemical_group: c.chemical_group_key || c.chemical_group,
      cost_per_unit: c.cost_per_unit, cost_unit: c.stock_unit,
      rate: c.default_rate ?? 0, rateStr: c.default_rate ? c.default_rate.toString() : "",
      unit: (c.default_unit as RateUnit) ?? "kg/ha",
    };
    setProducts((ps) => [...ps, newProduct]);
    setShowPicker(false);
    setPickerQuery("");
  }
  function updateProduct(id: string, patch: Partial<SpreadJobProduct & { rateStr: string }>) {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch, rate: patch.rateStr !== undefined ? parseFloat(patch.rateStr) || 0 : p.rate } : p)));
  }
  function removeProduct(id: string) { setProducts((ps) => ps.filter((p) => p.id !== id)); }

  const filteredChems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return chems;
    return chems.filter((c) => c.product_name.toLowerCase().includes(q) || (c.active_ingredient ?? "").toLowerCase().includes(q));
  }, [chems, pickerQuery]);

  function buildJob(status: SpreadJobStatus): SpreadJob {
    const businessId = ""; // filled by repo.spreadJobs.save via cloud-repo's bid(); harmless placeholder in local mode
    return {
      id,
      business_id: businessId,
      status,
      farm_id: farmId, farm_name: farmName,
      paddock_id: paddockId, paddock_name: paddockName,
      crop: crop.trim() || undefined,
      variety: variety.trim() || undefined,
      target: target.trim() || undefined,
      date,
      operator_id: operatorId, operator: operatorName,
      machinery_id: machineryId, machinery_name: machineryName,
      area_ha: areaHaNum || undefined,
      speed_kmh: parseFloat(speedKmh) || undefined,
      spread_width_m: parseFloat(spreadWidth) || undefined,
      temperature_c: weather?.t, humidity: weather?.h, wind_speed: weather?.ws, wind_direction: weather?.wd,
      weather_captured_at: weather?.at,
      gps_lat: weather?.lat, gps_lon: weather?.lon,
      notes: notes.trim() || undefined,
      products: products.map((p, i) => ({
        id: p.id, chemical_id: p.chemical_id, chemical_name: p.chemical_name,
        chemical_group: p.chemical_group, cost_per_unit: p.cost_per_unit, cost_unit: p.cost_unit,
        rate: p.rate, unit: p.unit, custom_unit_label: p.custom_unit_label,
        total_qty: productTotals[i]?.amount, total_qty_unit: productTotals[i]?.unit,
      })),
      created_at: new Date().toISOString(),
    };
  }

  const missingRequired = !farmId || !paddockId || !operatorId || !machineryId || !areaHaNum;

  async function startJob() {
    setError(null);
    if (missingRequired) { setError("Farm, paddock, operator, machine and area are all required to start a job."); return; }
    setSaving(true);
    try {
      const existing = await repo.spreadJobs.active();
      if (existing) { router.replace({ pathname: "/active-spread-job/[id]", params: { id: existing.id } }); return; }
      await captureWeather();
      const job = buildJob("active");
      job.start_time = new Date().toTimeString().slice(0, 5);
      await repo.spreadJobs.save(job);
      router.replace({ pathname: "/active-spread-job/[id]", params: { id: job.id } });
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
      await repo.spreadJobs.save(buildJob("planned"));
      router.replace("/(tabs)/spread");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save as planned");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      await repo.spreadJobs.save(buildJob("draft"));
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
      <ScreenHeader title="New Spread Job" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom + 100 }} keyboardShouldPersistTaps="handled">

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
            <Input label="Target / purpose" value={target} onChangeText={setTarget} placeholder="e.g. Pre-seeding nitrogen, lime" testID="input-target" />
            <Input label="Area to be spread" value={areaHa} onChangeText={setAreaHa} keyboardType="decimal-pad" suffix="ha" error={!areaHaNum} testID="input-area" />
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

          <Text style={styles.section}>Application setup</Text>
          <Card>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Speed" value={speedKmh} onChangeText={setSpeedKmh} keyboardType="decimal-pad" suffix="km/h" testID="input-speed" /></View>
              <View style={{ flex: 1 }}><Input label="Spread width" value={spreadWidth} onChangeText={setSpreadWidth} keyboardType="decimal-pad" suffix="m" testID="input-spread-width" /></View>
            </View>
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

          <Text style={styles.section}>Products</Text>
          <Card>
            <Pressable onPress={() => setShowPicker(true)} style={styles.addProductBtn} testID="add-product-btn">
              <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
              <Text style={styles.addProductText}>Add Product from Chemical Register</Text>
            </Pressable>

            {products.length === 0 ? (
              <Text style={styles.emptyProducts}>No products added yet. Rates are only entered by you — Chaser never recommends application rates.</Text>
            ) : (
              products.map((p, idx) => (
                <View key={p.id} style={styles.productCard} testID={`spread-product-${idx}`}>
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
                        {RATE_UNITS.map((u) => (
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
                    Total for {areaHaNum || "—"} ha: <Text style={{ fontWeight: "800" }}>{productTotals[idx] ? `${fmt(productTotals[idx]!.amount)} ${productTotals[idx]!.unit}` : "—"}</Text>
                  </Text>
                </View>
              ))
            )}
          </Card>

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
              </View>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => addProduct(item)} testID={`picker-chem-${item.id}`} style={({ pressed }) => [styles.pickerRow, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                <View style={styles.pickerIconBox}><Icon name="flask-outline" size={20} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerName}>{item.product_name}</Text>
                  {item.active_ingredient ? <Text style={styles.pickerAi}>{item.active_ingredient}</Text> : null}
                  <Text style={styles.pickerMeta}>
                    {item.default_rate ? `Default ${item.default_rate} ${item.default_unit}` : ""}
                  </Text>
                  <Text style={[styles.pickerMeta, item.stock_qty != null && item.stock_qty <= 0 && { color: colors.error, fontWeight: "700" }]}>
                    {item.stock_qty != null ? `In stock: ${item.stock_qty} ${item.stock_unit ?? ""}`.trimEnd() : "No stock recorded"}
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
  pickerLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  calcLine: { marginTop: 6, fontSize: 14, color: colors.onSurface },
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
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 48 },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerIconBox: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  pickerName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  pickerAi: { fontSize: 12, color: colors.onSurfaceTertiary, marginTop: 2 },
  pickerMeta: { fontSize: 11, color: colors.muted, marginTop: 2 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
