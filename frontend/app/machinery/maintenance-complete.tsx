import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Machinery, Maintenance, MaintenanceCompletion } from "@/src/lib/types";

export default function CompleteMaintenance() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId, maintenanceId } = useLocalSearchParams<{ machineId: string; maintenanceId: string }>();
  const [machine, setMachine] = useState<Machinery | null>(null);
  const [maint, setMaint] = useState<Maintenance | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    date: today,
    hours: "",
    km: "",
    work_performed: "",
    parts_used: "",
    cost: "",
    service_provider: "",
    notes: "",
    next_service_hours: "",
  });
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!machineId || !maintenanceId) return;
    (async () => {
      const [mach, mn] = await Promise.all([repo.machinery.get(machineId), repo.maintenance.get(maintenanceId)]);
      setMachine(mach);
      setMaint(mn);
      if (mach || mn) {
        // Preseed hours/km with current machine values; preseed next based on service interval
        const currentHours = mach?.current_hours;
        const nextHrs = mn && currentHours != null && mn.service_interval_hours != null
          ? currentHours + mn.service_interval_hours
          : mn?.next_service_hours;
        setF((prev) => ({
          ...prev,
          hours: currentHours != null ? String(currentHours) : prev.hours,
          km: mach?.current_km != null ? String(mach.current_km) : prev.km,
          work_performed: mn?.maintenance_type ?? prev.work_performed,
          next_service_hours: nextHrs != null ? String(nextHrs) : prev.next_service_hours,
        }));
      }
    })();
  }, [machineId, maintenanceId]));

  // Recompute next service hours whenever hours changes and interval known
  const recomputeNext = (newHours: string) => {
    if (!maint?.service_interval_hours) return;
    const h = parseFloat(newHours);
    if (!isNaN(h)) {
      setF((prev) => ({ ...prev, hours: newHours, next_service_hours: String(h + maint.service_interval_hours!) }));
    } else {
      setF((prev) => ({ ...prev, hours: newHours }));
    }
  };

  async function save() {
    if (!machine || !maint) return;
    if (!f.date.trim()) {
      Alert.alert("Date required", "Please enter the service date.");
      return;
    }
    setSaving(true);
    try {
      const business = await repo.getBusiness();
      if (!business) return;

      const hours = f.hours ? parseFloat(f.hours) : undefined;
      const km = f.km ? parseFloat(f.km) : undefined;
      const nextHours = f.next_service_hours ? parseFloat(f.next_service_hours) : undefined;

      // 1) Save completion (permanent service history)
      const completion: MaintenanceCompletion = {
        id: uuid(),
        business_id: business.id,
        machinery_id: machine.id,
        maintenance_id: maint.id,
        date: f.date,
        hours,
        km,
        work_performed: f.work_performed || undefined,
        parts_used: f.parts_used || undefined,
        cost: f.cost ? parseFloat(f.cost) : undefined,
        service_provider: f.service_provider || undefined,
        notes: f.notes || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.maintenanceCompletions.save(completion);

      // 2) Roll forward the schedule
      const updatedMaint: Maintenance = {
        ...maint,
        last_service_hours: hours ?? maint.last_service_hours,
        last_service_date: f.date,
        next_service_hours: nextHours ?? maint.next_service_hours,
        cost: completion.cost ?? maint.cost,
        parts_used: completion.parts_used ?? maint.parts_used,
      };
      await repo.maintenance.save(updatedMaint);

      // 3) If hours/km given exceed machine's current values, bump them
      const machinePatch: Partial<Machinery> = {};
      if (hours != null && (machine.current_hours == null || hours > machine.current_hours)) {
        machinePatch.current_hours = hours;
      }
      if (km != null && (machine.current_km == null || km > machine.current_km)) {
        machinePatch.current_km = km;
      }
      if (Object.keys(machinePatch).length > 0) {
        await repo.machinery.save({ ...machine, ...machinePatch });
      }

      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Complete Service" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {maint && machine ? (
            <>
              <Card style={{ marginBottom: spacing.md }}>
                <Text style={styles.pretitle}>MACHINE</Text>
                <Text style={styles.title}>{machine.name}</Text>
                <Text style={styles.pretitle}>SERVICE</Text>
                <Text style={styles.title}>{maint.maintenance_type}</Text>
                {maint.service_interval_hours ? (
                  <Text style={styles.helper}>Interval: {maint.service_interval_hours}h · Last: {maint.last_service_hours ?? "—"}h · Currently due at {maint.next_service_hours ?? "—"}h</Text>
                ) : null}
              </Card>

              <Card>
                <Input label="Service date*" value={f.date} onChangeText={(v) => setF({ ...f, date: v })} placeholder="YYYY-MM-DD" testID="complete-date" />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input label="Hours at service" value={f.hours} onChangeText={recomputeNext} keyboardType="decimal-pad" suffix="h" testID="complete-hours" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input label="Km at service" value={f.km} onChangeText={(v) => setF({ ...f, km: v })} keyboardType="decimal-pad" suffix="km" testID="complete-km" />
                  </View>
                </View>
                <Input label="Work performed" value={f.work_performed} onChangeText={(v) => setF({ ...f, work_performed: v })} multiline placeholder="e.g. Engine oil change, filter replacement" testID="complete-work" />
                <Input label="Parts used" value={f.parts_used} onChangeText={(v) => setF({ ...f, parts_used: v })} multiline placeholder="e.g. 15L Delo 15W-40, Baldwin B7577" testID="complete-parts" />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input label="Cost" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} keyboardType="decimal-pad" suffix="AUD" testID="complete-cost" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input label="Service provider" value={f.service_provider} onChangeText={(v) => setF({ ...f, service_provider: v })} placeholder="e.g. In-house / Dealer" testID="complete-provider" />
                  </View>
                </View>
                <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="complete-notes" />
              </Card>

              <Text style={styles.section}>Next service</Text>
              <Card>
                <Input
                  label="Next service due at (hours)"
                  value={f.next_service_hours}
                  onChangeText={(v) => setF({ ...f, next_service_hours: v })}
                  keyboardType="decimal-pad"
                  suffix="h"
                  testID="complete-next-hours"
                />
                <Text style={styles.helper}>
                  Auto-calculated from hours at service + interval ({maint.service_interval_hours ?? "—"}h). Edit if this service resets the clock differently.
                </Text>
              </Card>

              <View style={{ height: spacing.md }} />
              <Button title="Save Service" icon="check-circle-outline" onPress={save} loading={saving} disabled={saving || !f.date.trim()} testID="save-completion-btn" />
              <View style={{ height: spacing.sm }} />
              <Button title="Cancel" variant="outline" onPress={() => router.back()} testID="cancel-completion-btn" />
            </>
          ) : (
            <Card><Text style={{ color: colors.muted, textAlign: "center" }}>Loading…</Text></Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  pretitle: { fontSize: 11, color: colors.muted, fontWeight: "700", letterSpacing: 0.5, marginTop: spacing.sm },
  title: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  helper: { fontSize: 12, color: colors.muted, marginTop: 8, lineHeight: 16 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
});
