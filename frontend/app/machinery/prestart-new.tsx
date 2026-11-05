import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input, Chip } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { PRESTART_CHECKLIST } from "@/src/lib/prestart-checklist";
import type { Machinery, Operator, PreStartChecklistItem, PreStartChecklistStatus, PreStartInspection } from "@/src/lib/types";

const STATUS_ORDER: PreStartChecklistStatus[] = ["pass", "fail", "na"];
const STATUS_LABEL: Record<PreStartChecklistStatus, string> = { pass: "Pass", fail: "Fail", na: "N/A" };

function initialItems(): PreStartChecklistItem[] {
  return PRESTART_CHECKLIST.flatMap((section) => section.items.map((item) => ({ key: item.key, label: item.label, status: "pass" as PreStartChecklistStatus })));
}

export default function NewPreStart() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [machine, setMachine] = useState<Machinery | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorId, setOperatorId] = useState<string | undefined>();
  const [operatorName, setOperatorName] = useState<string | undefined>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<PreStartChecklistItem[]>(initialItems);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!machineId) return;
    repo.machinery.get(machineId).then(setMachine);
  }, [machineId]));

  useEffect(() => {
    repo.operators.active().then((ops) => {
      setOperators(ops);
      setOperatorId((current) => {
        if (current) return current;
        const def = ops.find((o) => o.is_default_user);
        if (def) setOperatorName(def.name);
        return def?.id;
      });
    }).catch(() => {});
  }, []);

  function pickOperator(o: Operator) { setOperatorId(o.id); setOperatorName(o.name); }

  function cycleStatus(key: string) {
    setItems((prev) => prev.map((it) => {
      if (it.key !== key) return it;
      const next = STATUS_ORDER[(STATUS_ORDER.indexOf(it.status) + 1) % STATUS_ORDER.length];
      return { ...it, status: next, note: next === "fail" ? it.note : undefined };
    }));
  }

  function setItemNote(key: string, note: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, note } : it)));
  }

  function markAllPass() {
    setItems((prev) => prev.map((it) => ({ ...it, status: "pass" as PreStartChecklistStatus, note: undefined })));
  }

  const failedCount = items.filter((it) => it.status === "fail").length;
  const passed = failedCount === 0;

  async function save() {
    if (!machine) return;
    setError(null);
    if (!operatorId) { setError("Pick an operator before saving."); return; }
    setSaving(true);
    try {
      const business = await repo.getBusiness();
      if (!business) return;
      const record: PreStartInspection = {
        id: uuid(),
        business_id: business.id,
        machinery_id: machine.id,
        date,
        operator_id: operatorId,
        operator: operatorName,
        checklist_json: JSON.stringify(items),
        passed,
        notes: notes.trim() || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.prestarts.save(record);
      router.back();
    } catch (e: any) {
      Alert.alert("Couldn't save pre-start", e?.message ?? "Please try again");
    } finally {
      setSaving(false);
    }
  }

  if (!machine) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Pre-Start Check" back /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Pre-Start Check" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">

          {error ? (
            <View style={styles.errorBox}><Icon name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View>
          ) : null}

          <Card>
            <Text style={styles.machineName}>{machine.name}</Text>
            <Text style={styles.machineSub}>{[machine.make, machine.model].filter(Boolean).join(" ") || machine.machine_type}</Text>
          </Card>

          <Text style={styles.section}>Operator</Text>
          <Card>
            <View style={styles.chipRow}>
              {operators.map((o) => <Chip key={o.id} label={o.name + (o.is_default_user ? " · you" : "")} active={operatorId === o.id} onPress={() => pickOperator(o)} testID={`operator-${o.id}`} />)}
            </View>
            <Input label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="input-date" />
          </Card>

          <View style={styles.sectionRow}>
            <Text style={[styles.section, { marginTop: 0 }]}>Checklist</Text>
            <Pressable onPress={markAllPass} testID="mark-all-pass-btn"><Text style={styles.link}>Mark all Pass</Text></Pressable>
          </View>

          {PRESTART_CHECKLIST.map((section) => (
            <View key={section.title} style={{ marginBottom: spacing.md }}>
              <Text style={styles.subSection}>{section.title}</Text>
              <Card>
                {section.items.map((def, idx) => {
                  const it = items.find((x) => x.key === def.key)!;
                  return (
                    <View key={def.key} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.itemLabel}>{def.label}</Text>
                        <Pressable onPress={() => cycleStatus(def.key)} style={[styles.statusBtn, styles[`status_${it.status}` as const]]} testID={`item-status-${def.key}`}>
                          <Text style={[styles.statusBtnText, it.status === "fail" && { color: colors.onError }, it.status === "pass" && { color: colors.onSuccess }]}>{STATUS_LABEL[it.status]}</Text>
                        </Pressable>
                      </View>
                      {it.status === "fail" ? (
                        <Input label="What's wrong?" value={it.note ?? ""} onChangeText={(v) => setItemNote(def.key, v)} placeholder="Describe the issue" testID={`item-note-${def.key}`} />
                      ) : null}
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}

          <View style={[styles.summaryBox, !passed && styles.summaryBoxFail]}>
            <Icon name={passed ? "check-decagram" : "alert-circle"} size={20} color={passed ? colors.onSuccess : colors.onError} />
            <Text style={[styles.summaryText, { color: passed ? colors.onSuccess : colors.onError }]}>
              {passed ? "All checks passed" : `${failedCount} item${failedCount === 1 ? "" : "s"} failed`}
            </Text>
          </View>

          <Text style={styles.section}>Notes</Text>
          <Card>
            <Input label="Notes" value={notes} onChangeText={setNotes} multiline testID="input-notes" />
          </Card>

          <View style={{ height: spacing.lg }} />
          <Button title="Save Pre-Start Check" icon="content-save-outline" size="lg" onPress={save} loading={saving} disabled={saving} testID="save-prestart-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  machineName: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  machineSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  subSection: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceTertiary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  itemRow: { paddingVertical: 10 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemLabel: { flex: 1, fontSize: 14, color: colors.onSurface, fontWeight: "600", paddingRight: 8 },
  statusBtn: { minWidth: 64, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  statusBtnText: { fontSize: 12, fontWeight: "800" },
  status_pass: { backgroundColor: colors.success, borderColor: colors.success },
  status_fail: { backgroundColor: colors.error, borderColor: colors.error },
  status_na: { backgroundColor: colors.surfaceTertiary, borderColor: colors.border },
  summaryBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.success, padding: spacing.md, borderRadius: radius.md, marginTop: spacing.md },
  summaryBoxFail: { backgroundColor: colors.error },
  summaryText: { fontWeight: "800", fontSize: 14 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md, backgroundColor: "#FEE2E2", padding: 10, borderRadius: radius.md },
  errorText: { color: colors.error, fontWeight: "600", fontSize: 12, flex: 1, lineHeight: 16 },
});
