import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { stageLabel } from "@/src/lib/crop-stages";
import { useAuth } from "@/src/lib/auth-context";
import { exportJobsPdf } from "@/src/lib/pdf-report";
import { productCost } from "@/src/lib/calculators";
import type { SprayJob, Operator, Machinery } from "@/src/lib/types";

function buildSignOffPayload(j: SprayJob) {
  return {
    v: 1,
    kind: "hectarehq_spray_signoff",
    id: j.id,
    date: j.date,
    farm: j.farm_name,
    paddock: j.paddock_name,
    crop: j.crop,
    target: j.target,
    operator: j.operator,
    machine: j.machinery_name,
    area_ha: j.actual_area_ha ?? j.area_ha,
    water_rate_lha: j.water_rate,
    speed_kmh: j.speed_kmh,
    nozzle: j.nozzle_type,
    start_time: j.start_time,
    finish_time: j.finish_time,
    start_weather: {
      t: j.temperature_c, rh: j.humidity, delta_t: j.delta_t,
      wind: j.wind_speed, dir: j.wind_direction, at: j.weather_captured_at,
    },
    finish_weather: {
      t: j.finish_temperature_c, rh: j.finish_humidity, delta_t: j.finish_delta_t,
      wind: j.finish_wind_speed, dir: j.finish_wind_direction, at: j.finish_weather_captured_at,
    },
    gps: j.gps_lat ? { lat: j.gps_lat, lon: j.gps_lon } : undefined,
    products: j.products.map((p) => ({ name: p.chemical_name, rate: p.rate, unit: p.unit, total: p.total_qty })),
    notes: j.notes,
    finish_notes: j.finish_notes,
  };
}

// Editable fields — deliberately excludes farm/paddock (reassigning those has
// wider effects on weather locations & history groupings), weather readings
// (already have their own operator-verified-edit flow during the active job),
// and chemicals (quantities are already tied to stock_movements — editing
// them here would desync the stock ledger without also reconciling it).
type EditForm = {
  crop: string;
  variety: string;
  target: string;
  operator_id: string;
  operator_name: string;
  machinery_id: string;
  machinery_name: string;
  area_ha: string;
  actual_area_ha: string;
  start_time: string;
  finish_time: string;
  water_rate: string;
  speed_kmh: string;
  boom_width_m: string;
  nozzle_type: string;
  pressure: string;
  notes: string;
  finish_notes: string;
};

function toForm(j: SprayJob): EditForm {
  return {
    crop: j.crop ?? "",
    variety: j.variety ?? "",
    target: j.target ?? "",
    operator_id: j.operator_id ?? "",
    operator_name: j.operator ?? "",
    machinery_id: j.machinery_id ?? "",
    machinery_name: j.machinery_name ?? "",
    area_ha: j.area_ha != null ? String(j.area_ha) : "",
    actual_area_ha: j.actual_area_ha != null ? String(j.actual_area_ha) : "",
    start_time: j.start_time ?? "",
    finish_time: j.finish_time ?? "",
    water_rate: j.water_rate != null ? String(j.water_rate) : "",
    speed_kmh: j.speed_kmh != null ? String(j.speed_kmh) : "",
    boom_width_m: j.boom_width_m != null ? String(j.boom_width_m) : "",
    nozzle_type: j.nozzle_type ?? "",
    pressure: j.pressure != null ? String(j.pressure) : "",
    notes: j.notes ?? "",
    finish_notes: j.finish_notes ?? "",
  };
}

function num(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : n;
}

export default function RecordDetail() {
  const insets = useSafeAreaInsets();
  const { business } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<SprayJob | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<Machinery[]>([]);

  useFocusEffect(useCallback(() => { if (id) repo.sprayJobs.get(id as string).then(setJ); }, [id]));

  function startEdit() {
    if (!j) return;
    setForm(toForm(j));
    setSaveError(null);
    setEditing(true);
    repo.operators.active().then(setOperators).catch(() => {});
    repo.machinery.list().then((m) => setMachines(m.filter((x) => !x.archived_at))).catch(() => {});
  }

  function cancelEdit() {
    setEditing(false);
    setForm(null);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!j || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated: SprayJob = {
        ...j,
        crop: form.crop.trim() || undefined,
        variety: form.variety.trim() || undefined,
        target: form.target.trim() || undefined,
        operator_id: form.operator_id || undefined,
        operator: form.operator_name.trim() || undefined,
        machinery_id: form.machinery_id || undefined,
        machinery_name: form.machinery_name.trim() || undefined,
        area_ha: num(form.area_ha),
        actual_area_ha: num(form.actual_area_ha),
        start_time: form.start_time.trim() || undefined,
        finish_time: form.finish_time.trim() || undefined,
        water_rate: num(form.water_rate),
        speed_kmh: num(form.speed_kmh),
        boom_width_m: num(form.boom_width_m),
        nozzle_type: form.nozzle_type.trim() || undefined,
        pressure: num(form.pressure),
        notes: form.notes.trim() || undefined,
        finish_notes: form.finish_notes.trim() || undefined,
      };
      await repo.sprayJobs.save(updated);
      setJ(updated);
      setEditing(false);
      setForm(null);
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  if (!j) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Spray Record" back /></View>;

  const payload = buildSignOffPayload(j);
  const payloadStr = JSON.stringify(payload);
  const isCompleted = j.status === "completed";

  async function shareRecord() {
    const summary = `Chaser Spray Record\n${j!.date} · ${j!.farm_name ?? ""} · ${j!.paddock_name ?? ""}\nCrop: ${j!.crop ?? "—"} · Target: ${j!.target ?? "—"}\nArea: ${j!.actual_area_ha ?? j!.area_ha ?? "—"} ha\nOperator: ${j!.operator ?? "—"}\nMachine: ${j!.machinery_name ?? "—"}\nProducts:\n${j!.products.map((p) => `  · ${p.chemical_name} ${p.rate} ${p.unit}${p.total_qty ? ` (total ${p.total_qty.toFixed(2)})` : ""}`).join("\n")}\nWeather: ${j!.temperature_c ?? "—"}°C, RH ${j!.humidity ?? "—"}%, Delta T ${j!.delta_t ?? "—"}, Wind ${j!.wind_speed ?? "—"} km/h ${j!.wind_direction ?? ""}`;
    try { await Share.share({ message: summary }); } catch {}
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader
        title="Spray Record"
        back
        right={
          editing ? (
            <Pressable onPress={cancelEdit} hitSlop={8} testID="cancel-edit-record-btn">
              <Text style={styles.headerCancel}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable onPress={startEdit} hitSlop={8} testID="edit-record-btn">
              <Icon name="pencil" size={22} color={colors.brandPrimary} />
            </Pressable>
          )
        }
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.title}>{j.paddock_name ?? "Paddock"}</Text>
            {isCompleted ? <View style={styles.doneBadge}><Icon name="check-circle" size={14} color={colors.onSuccess} /><Text style={styles.doneBadgeText}>Completed</Text></View> : null}
          </View>
          <Text style={styles.sub}>{j.farm_name ?? ""} · {j.date}</Text>
        </Card>

        {saveError ? (
          <View style={styles.errorBox} testID="record-save-error">
            <Icon name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        ) : null}

        {isCompleted && !editing && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Sign-Off QR</Text>
              <Pressable onPress={() => setShowQR((v) => !v)} testID="toggle-qr-btn">
                <Text style={styles.link}>{showQR ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            {showQR ? (
              <Card style={{ alignItems: "center", paddingVertical: spacing.xl }} testID="qr-card">
                <View style={styles.qrWrap}>
                  <QRCode value={payloadStr} size={220} backgroundColor={colors.surfaceSecondary} color={colors.onSurface} />
                </View>
                <Text style={styles.qrCaption}>Scan to verify this spray job at the paddock gate.</Text>
                <Text style={styles.qrId}>Record ID: {j.id.slice(0, 8)}</Text>
                <View style={{ height: spacing.md, alignSelf: "stretch" }} />
                <View style={{ flexDirection: "row", gap: 8, alignSelf: "stretch" }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Share" icon="share-variant-outline" variant="outline" onPress={shareRecord} testID="share-record-btn" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Export PDF" icon="file-pdf-box" variant="outline" onPress={() => exportJobsPdf([j], business?.name ?? "Chaser")} testID="export-record-pdf-btn" />
                  </View>
                </View>
              </Card>
            ) : (
              <Card onPress={() => setShowQR(true)} testID="qr-preview-card">
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.qrIconBox}><Icon name="qrcode-scan" size={26} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.qrPreviewTitle}>Show QR code for verification</Text>
                    <Text style={styles.qrPreviewSub}>Agronomists & auditors can scan to check the tank mix, weather, area & operator.</Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={colors.muted} />
                </View>
              </Card>
            )}
          </>
        )}

        <Text style={styles.section}>Job</Text>
        {editing && form ? (
          <Card>
            <Input label="Crop" value={form.crop} onChangeText={(v) => setForm((s) => s && { ...s, crop: v })} testID="edit-crop" />
            <Input label="Variety" value={form.variety} onChangeText={(v) => setForm((s) => s && { ...s, variety: v })} testID="edit-variety" />
            <Input label="Target" value={form.target} onChangeText={(v) => setForm((s) => s && { ...s, target: v })} testID="edit-target" />

            <Text style={styles.pickerLabel}>Operator</Text>
            <View style={styles.chipRow}>
              {operators.map((o) => (
                <Chip
                  key={o.id}
                  label={o.name}
                  active={form.operator_id === o.id}
                  onPress={() => setForm((s) => s && { ...s, operator_id: o.id, operator_name: o.name })}
                  testID={`edit-operator-${o.id}`}
                />
              ))}
            </View>

            <Text style={styles.pickerLabel}>Machine</Text>
            <View style={styles.chipRow}>
              {machines.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  active={form.machinery_id === m.id}
                  onPress={() => setForm((s) => s && { ...s, machinery_id: m.id, machinery_name: m.name })}
                  testID={`edit-machine-${m.id}`}
                />
              ))}
            </View>

            <Input label="Area planned (ha)" value={form.area_ha} onChangeText={(v) => setForm((s) => s && { ...s, area_ha: v })} keyboardType="decimal-pad" testID="edit-area-ha" />
            <Input label="Actual area treated (ha)" value={form.actual_area_ha} onChangeText={(v) => setForm((s) => s && { ...s, actual_area_ha: v })} keyboardType="decimal-pad" testID="edit-actual-area-ha" />
            <Input label="Start time" value={form.start_time} onChangeText={(v) => setForm((s) => s && { ...s, start_time: v })} testID="edit-start-time" />
            <Input label="Finish time" value={form.finish_time} onChangeText={(v) => setForm((s) => s && { ...s, finish_time: v })} testID="edit-finish-time" />
          </Card>
        ) : (
          <Card>
            <Field label="Crop" value={j.crop} />
            <Field label="Crop stage" value={j.crop_stage || j.crop_stage_custom ? stageLabel(j.crop_stage, j.crop_stage_custom, j.crop) : undefined} />
            <Field label="Target" value={j.target} />
            <Field label="Operator" value={j.operator} />
            <Field label="Machine" value={j.machinery_name} />
            <Field label="Area planned" value={j.area_ha != null ? `${j.area_ha} ha` : undefined} />
            {j.actual_area_ha != null ? <Field label="Actual area treated" value={`${j.actual_area_ha} ha`} /> : null}
            <Field label="Start / Finish" value={`${j.start_time ?? "—"} → ${j.finish_time ?? "—"}`} />
          </Card>
        )}

        <Text style={styles.section}>Application</Text>
        {editing && form ? (
          <Card>
            <Input label="Water rate (L/ha)" value={form.water_rate} onChangeText={(v) => setForm((s) => s && { ...s, water_rate: v })} keyboardType="decimal-pad" testID="edit-water-rate" />
            <Input label="Speed (km/h)" value={form.speed_kmh} onChangeText={(v) => setForm((s) => s && { ...s, speed_kmh: v })} keyboardType="decimal-pad" testID="edit-speed" />
            <Input label="Boom width (m)" value={form.boom_width_m} onChangeText={(v) => setForm((s) => s && { ...s, boom_width_m: v })} keyboardType="decimal-pad" testID="edit-boom-width" />
            <Input label="Nozzle type" value={form.nozzle_type} onChangeText={(v) => setForm((s) => s && { ...s, nozzle_type: v })} testID="edit-nozzle-type" />
            <Input label="Pressure (bar)" value={form.pressure} onChangeText={(v) => setForm((s) => s && { ...s, pressure: v })} keyboardType="decimal-pad" testID="edit-pressure" />
          </Card>
        ) : (
          <Card>
            <Field label="Water rate" value={j.water_rate ? `${j.water_rate} L/ha` : undefined} />
            <Field label="Speed" value={j.speed_kmh ? `${j.speed_kmh} km/h` : undefined} />
            <Field label="Boom width" value={j.boom_width_m ? `${j.boom_width_m} m` : undefined} />
            <Field label="Nozzle type" value={j.nozzle_type} />
            <Field label="Pressure" value={j.pressure ? `${j.pressure} bar` : undefined} />
          </Card>
        )}

        <View style={styles.wxHeaderRow}>
          <Text style={[styles.section, { marginTop: 0 }]}>Starting weather</Text>
          {j.weather_edited ? (
            <View style={styles.editedBadge} testID="record-weather-edited-badge">
              <Icon name="pencil" size={11} color={colors.warning} />
              <Text style={styles.editedBadgeText}>Operator-edited</Text>
            </View>
          ) : (
            <View style={styles.autoBadge}>
              <Icon name="cloud-outline" size={11} color={colors.brandPrimary} />
              <Text style={styles.autoBadgeText}>Auto-captured</Text>
            </View>
          )}
        </View>
        <Card>
          <Field label="Temperature" value={j.temperature_c != null ? `${j.temperature_c} °C` : undefined} />
          <Field label="Relative humidity" value={j.humidity != null ? `${j.humidity} %` : undefined} />
          <Field label="Delta T" value={j.delta_t != null ? `${j.delta_t}` : undefined} />
          <Field label="Wind" value={j.wind_speed != null ? `${j.wind_speed} km/h ${j.wind_direction ?? ""}` : undefined} />
          {j.weather_edited && (j.temperature_c_auto != null || j.wind_speed_auto != null) ? (
            <View style={styles.autoNote} testID="record-auto-original">
              <Text style={styles.autoNoteTitle}>Original auto-captured reading (audit)</Text>
              <Text style={styles.autoNoteBody}>
                {j.temperature_c_auto != null ? `${j.temperature_c_auto.toFixed(1)} °C · ` : ""}
                {j.humidity_auto != null ? `${j.humidity_auto.toFixed(0)}% RH · ` : ""}
                {j.delta_t_auto != null ? `ΔT ${j.delta_t_auto.toFixed(1)} · ` : ""}
                {j.wind_speed_auto != null ? `${j.wind_speed_auto.toFixed(0)} km/h ` : ""}
                {j.wind_direction_auto ?? ""}
              </Text>
              <Text style={styles.autoNoteMeta}>Weather data was operator-verified — saved values above take precedence.</Text>
            </View>
          ) : null}
        </Card>

        {j.finish_temperature_c != null || j.finish_wind_speed != null ? (
          <>
            <Text style={styles.section}>Finish weather</Text>
            <Card>
              <Field label="Temperature" value={j.finish_temperature_c != null ? `${j.finish_temperature_c} °C` : undefined} />
              <Field label="Relative humidity" value={j.finish_humidity != null ? `${j.finish_humidity} %` : undefined} />
              <Field label="Delta T" value={j.finish_delta_t != null ? `${j.finish_delta_t}` : undefined} />
              <Field label="Wind" value={j.finish_wind_speed != null ? `${j.finish_wind_speed} km/h ${j.finish_wind_direction ?? ""}` : undefined} />
            </Card>
          </>
        ) : null}

        <Text style={styles.section}>Chemicals ({j.products.length})</Text>
        {j.products.length === 0 ? (
          <Card><Text style={styles.empty}>No chemicals recorded.</Text></Card>
        ) : (
          <>
            {j.products.map((p) => {
              const cost = productCost(p);
              return (
                <Card key={p.id} style={{ marginBottom: spacing.sm }}>
                  <Text style={styles.prodName}>{p.chemical_name}</Text>
                  <Text style={styles.prodMeta}>Rate: {p.rate} {p.unit}</Text>
                  {p.total_qty != null ? <Text style={styles.prodMeta}>Total: {p.total_qty.toFixed(2)} {p.total_qty_unit ?? (p.unit === "%v/v" ? "L water" : p.unit.replace("/ha", ""))}</Text> : null}
                  {cost != null ? <Text style={styles.prodMeta}>Cost: ${cost.toFixed(2)}</Text> : null}
                </Card>
              );
            })}
            {(() => {
              const costs = j.products.map(productCost).filter((n): n is number => n != null);
              if (costs.length === 0) return null;
              const total = costs.reduce((s, n) => s + n, 0);
              return (
                <Card style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={styles.prodName}>Total product cost</Text>
                    <Text style={styles.prodName}>${total.toFixed(2)}</Text>
                  </View>
                  {costs.length < j.products.length ? <Text style={styles.editNotice}>Some products don&apos;t have cost data yet, so this isn&apos;t the full job cost.</Text> : null}
                </Card>
              );
            })()}
          </>
        )}
        {editing ? <Text style={styles.editNotice}>Chemicals and weather readings aren&apos;t editable here — they&apos;re tied to stock records and the verified capture flow.</Text> : null}

        <Text style={styles.section}>Notes</Text>
        {editing && form ? (
          <Card>
            <Input label="Notes" value={form.notes} onChangeText={(v) => setForm((s) => s && { ...s, notes: v })} multiline testID="edit-notes" />
            <Input label="Final notes" value={form.finish_notes} onChangeText={(v) => setForm((s) => s && { ...s, finish_notes: v })} multiline testID="edit-finish-notes" />
          </Card>
        ) : (
          <>
            {j.notes ? <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{j.notes}</Text></Card> : null}
            {j.finish_notes ? (
              <>
                <View style={{ height: spacing.sm }} />
                <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{j.finish_notes}</Text></Card>
              </>
            ) : null}
            {!j.notes && !j.finish_notes ? <Card><Text style={styles.empty}>No notes recorded.</Text></Card> : null}
          </>
        )}

        {editing ? (
          <>
            <View style={{ height: spacing.md }} />
            <Button title="Save changes" icon="content-save-outline" onPress={saveEdit} loading={saving} disabled={saving} testID="save-record-btn" />
          </>
        ) : (
          <Text style={styles.discl}>
            Check current product label, weather conditions and local spraying requirements before application.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value?: string | number }) {
  return (
    <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value ?? "—"}</Text></View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  doneBadgeText: { color: colors.onSuccess, fontWeight: "800", fontSize: 11 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  prodName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  prodMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  discl: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.lg, lineHeight: 18, paddingHorizontal: 20 },
  qrWrap: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  qrCaption: { fontSize: 13, color: colors.onSurface, marginTop: spacing.md, textAlign: "center", fontWeight: "600" },
  qrId: { fontSize: 11, color: colors.muted, marginTop: 4, fontFamily: "monospace" },
  qrIconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  qrPreviewTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  qrPreviewSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  wxHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  editedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FEF3C7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  editedBadgeText: { color: colors.warning, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  autoBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  autoBadgeText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  autoNote: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.muted },
  autoNoteTitle: { fontSize: 11, color: colors.muted, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  autoNoteBody: { fontSize: 13, color: colors.onSurface, marginTop: 3, fontWeight: "600" },
  autoNoteMeta: { fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: "italic" },
  headerCancel: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
  pickerLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  editNotice: { fontSize: 12, color: colors.muted, fontStyle: "italic", marginTop: spacing.sm, lineHeight: 16 },
});
