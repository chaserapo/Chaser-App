import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { HarvestJob, HarvestYieldUnit, Operator, Machinery } from "@/src/lib/types";

const YIELD_UNITS: { id: HarvestYieldUnit; label: string }[] = [
  { id: "t_ha", label: "t/ha" },
  { id: "bu_ac", label: "bu/ac" },
];

type EditForm = {
  crop: string;
  variety: string;
  operator_id: string;
  operator_name: string;
  machinery_id: string;
  machinery_name: string;
  area_ha: string;
  actual_area_ha: string;
  start_time: string;
  finish_time: string;
  yield_value: string;
  yield_unit: HarvestYieldUnit;
  moisture_pct: string;
  protein_pct: string;
  screenings_pct: string;
  grade: string;
  destination: string;
  notes: string;
  finish_notes: string;
};

function toForm(j: HarvestJob): EditForm {
  return {
    crop: j.crop ?? "",
    variety: j.variety ?? "",
    operator_id: j.operator_id ?? "",
    operator_name: j.operator ?? "",
    machinery_id: j.machinery_id ?? "",
    machinery_name: j.machinery_name ?? "",
    area_ha: j.area_ha != null ? String(j.area_ha) : "",
    actual_area_ha: j.actual_area_ha != null ? String(j.actual_area_ha) : "",
    start_time: j.start_time ?? "",
    finish_time: j.finish_time ?? "",
    yield_value: j.yield_value != null ? String(j.yield_value) : "",
    yield_unit: j.yield_unit ?? "t_ha",
    moisture_pct: j.moisture_pct != null ? String(j.moisture_pct) : "",
    protein_pct: j.protein_pct != null ? String(j.protein_pct) : "",
    screenings_pct: j.screenings_pct != null ? String(j.screenings_pct) : "",
    grade: j.grade ?? "",
    destination: j.destination ?? "",
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

export default function HarvestRecordDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<HarvestJob | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<Machinery[]>([]);

  useFocusEffect(useCallback(() => { if (id) repo.harvestJobs.get(id as string).then(setJ); }, [id]));

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
      const updated: HarvestJob = {
        ...j,
        crop: form.crop.trim() || undefined,
        variety: form.variety.trim() || undefined,
        operator_id: form.operator_id || undefined,
        operator: form.operator_name.trim() || undefined,
        machinery_id: form.machinery_id || undefined,
        machinery_name: form.machinery_name.trim() || undefined,
        area_ha: num(form.area_ha),
        actual_area_ha: num(form.actual_area_ha),
        start_time: form.start_time.trim() || undefined,
        finish_time: form.finish_time.trim() || undefined,
        yield_value: num(form.yield_value),
        yield_unit: form.yield_value ? form.yield_unit : undefined,
        moisture_pct: num(form.moisture_pct),
        protein_pct: num(form.protein_pct),
        screenings_pct: num(form.screenings_pct),
        grade: form.grade.trim() || undefined,
        destination: form.destination.trim() || undefined,
        notes: form.notes.trim() || undefined,
        finish_notes: form.finish_notes.trim() || undefined,
      };
      await repo.harvestJobs.save(updated);
      setJ(updated);
      setEditing(false);
      setForm(null);
    } catch (e: any) {
      setSaveError(e?.message ?? "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  if (!j) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Harvest Record" back /></View>;

  const isCompleted = j.status === "completed";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader
        title="Harvest Record"
        back
        right={
          editing ? (
            <Pressable onPress={cancelEdit} hitSlop={8} testID="cancel-edit-record-btn"><Text style={styles.headerCancel}>Cancel</Text></Pressable>
          ) : (
            <Pressable onPress={startEdit} hitSlop={8} testID="edit-record-btn"><Icon name="pencil" size={22} color={colors.brandPrimary} /></Pressable>
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

        <Text style={styles.section}>Job</Text>
        {editing && form ? (
          <Card>
            <Input label="Crop" value={form.crop} onChangeText={(v) => setForm((s) => s && { ...s, crop: v })} testID="edit-crop" />
            <Input label="Variety" value={form.variety} onChangeText={(v) => setForm((s) => s && { ...s, variety: v })} testID="edit-variety" />

            <Text style={styles.pickerLabel}>Operator</Text>
            <View style={styles.chipRow}>
              {operators.map((o) => (
                <Chip key={o.id} label={o.name} active={form.operator_id === o.id} onPress={() => setForm((s) => s && { ...s, operator_id: o.id, operator_name: o.name })} testID={`edit-operator-${o.id}`} />
              ))}
            </View>

            <Text style={styles.pickerLabel}>Machine</Text>
            <View style={styles.chipRow}>
              {machines.map((m) => (
                <Chip key={m.id} label={m.name} active={form.machinery_id === m.id} onPress={() => setForm((s) => s && { ...s, machinery_id: m.id, machinery_name: m.name })} testID={`edit-machine-${m.id}`} />
              ))}
            </View>

            <Input label="Area planned (ha)" value={form.area_ha} onChangeText={(v) => setForm((s) => s && { ...s, area_ha: v })} keyboardType="decimal-pad" testID="edit-area-ha" />
            <Input label="Actual area harvested (ha)" value={form.actual_area_ha} onChangeText={(v) => setForm((s) => s && { ...s, actual_area_ha: v })} keyboardType="decimal-pad" testID="edit-actual-area-ha" />
            <Input label="Start time" value={form.start_time} onChangeText={(v) => setForm((s) => s && { ...s, start_time: v })} testID="edit-start-time" />
            <Input label="Finish time" value={form.finish_time} onChangeText={(v) => setForm((s) => s && { ...s, finish_time: v })} testID="edit-finish-time" />
          </Card>
        ) : (
          <Card>
            <Field label="Crop" value={j.crop} />
            <Field label="Variety" value={j.variety} />
            <Field label="Operator" value={j.operator} />
            <Field label="Machine" value={j.machinery_name} />
            <Field label="Area planned" value={j.area_ha != null ? `${j.area_ha} ha` : undefined} />
            {j.actual_area_ha != null ? <Field label="Actual area harvested" value={`${j.actual_area_ha} ha`} /> : null}
            <Field label="Start / Finish" value={`${j.start_time ?? "—"} → ${j.finish_time ?? "—"}`} />
          </Card>
        )}

        <Text style={styles.section}>Results</Text>
        {editing && form ? (
          <Card>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input label="Yield" value={form.yield_value} onChangeText={(v) => setForm((s) => s && { ...s, yield_value: v })} keyboardType="decimal-pad" testID="edit-yield" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerLabel}>Unit</Text>
                <View style={styles.chipRow}>
                  {YIELD_UNITS.map((u) => (
                    <Chip key={u.id} label={u.label} active={form.yield_unit === u.id} onPress={() => setForm((s) => s && { ...s, yield_unit: u.id })} testID={`edit-yield-unit-${u.id}`} />
                  ))}
                </View>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Moisture (%)" value={form.moisture_pct} onChangeText={(v) => setForm((s) => s && { ...s, moisture_pct: v })} keyboardType="decimal-pad" testID="edit-moisture" /></View>
              <View style={{ flex: 1 }}><Input label="Protein (%)" value={form.protein_pct} onChangeText={(v) => setForm((s) => s && { ...s, protein_pct: v })} keyboardType="decimal-pad" testID="edit-protein" /></View>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Screenings (%)" value={form.screenings_pct} onChangeText={(v) => setForm((s) => s && { ...s, screenings_pct: v })} keyboardType="decimal-pad" testID="edit-screenings" /></View>
              <View style={{ flex: 1 }}><Input label="Grade" value={form.grade} onChangeText={(v) => setForm((s) => s && { ...s, grade: v })} testID="edit-grade" /></View>
            </View>
            <Input label="Destination" value={form.destination} onChangeText={(v) => setForm((s) => s && { ...s, destination: v })} testID="edit-destination" />
          </Card>
        ) : (
          <Card>
            <Field label="Yield" value={j.yield_value != null ? `${j.yield_value} ${j.yield_unit === "bu_ac" ? "bu/ac" : "t/ha"}` : undefined} />
            <Field label="Moisture" value={j.moisture_pct != null ? `${j.moisture_pct}%` : undefined} />
            <Field label="Protein" value={j.protein_pct != null ? `${j.protein_pct}%` : undefined} />
            <Field label="Screenings" value={j.screenings_pct != null ? `${j.screenings_pct}%` : undefined} />
            <Field label="Grade" value={j.grade} />
            <Field label="Destination" value={j.destination} />
          </Card>
        )}

        <Text style={styles.section}>Starting weather</Text>
        <Card>
          <Field label="Temperature" value={j.temperature_c != null ? `${j.temperature_c} °C` : undefined} />
          <Field label="Relative humidity" value={j.humidity != null ? `${j.humidity} %` : undefined} />
          <Field label="Wind" value={j.wind_speed != null ? `${j.wind_speed} km/h ${j.wind_direction ?? ""}` : undefined} />
        </Card>

        {j.finish_temperature_c != null || j.finish_wind_speed != null ? (
          <>
            <Text style={styles.section}>Finish weather</Text>
            <Card>
              <Field label="Temperature" value={j.finish_temperature_c != null ? `${j.finish_temperature_c} °C` : undefined} />
              <Field label="Relative humidity" value={j.finish_humidity != null ? `${j.finish_humidity} %` : undefined} />
              <Field label="Wind" value={j.finish_wind_speed != null ? `${j.finish_wind_speed} km/h ${j.finish_wind_direction ?? ""}` : undefined} />
            </Card>
          </>
        ) : null}

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
        ) : null}
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
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  empty: { color: colors.muted, textAlign: "center" },
  headerCancel: { color: colors.brandPrimary, fontWeight: "700", fontSize: 15 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
  pickerLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", marginTop: spacing.sm, marginBottom: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
});
