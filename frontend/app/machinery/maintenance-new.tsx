import { useCallback, useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Machinery, Maintenance, MaintenanceCompletion } from "@/src/lib/types";

export default function NewMaintenance() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [machine, setMachine] = useState<Machinery | null>(null);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    maintenance_type: "",
    machine_hours: "",
    date: today,
    approx_cost: "",
    work_performed: "",
    notes: "",
  });

  useFocusEffect(useCallback(() => {
    if (!machineId) return;
    (async () => {
      const mach = await repo.machinery.get(machineId);
      setMachine(mach);
      if (mach?.current_hours != null) {
        setF((prev) => ({ ...prev, machine_hours: prev.machine_hours || String(mach.current_hours) }));
      }
    })();
  }, [machineId]));

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !machineId || !f.maintenance_type.trim() || !f.date.trim()) return;

    setSaving(true);
    try {
      const maintenanceId = uuid();
      const hours = f.machine_hours ? parseFloat(f.machine_hours) : undefined;
      const cost = f.approx_cost ? parseFloat(f.approx_cost) : undefined;

      // Keep a lightweight maintenance item so the type still appears in the
      // machine's maintenance list, while the completion stores the actual record.
      const maintenance: Maintenance = {
        id: maintenanceId,
        business_id: business.id,
        machinery_id: machineId,
        maintenance_type: f.maintenance_type.trim(),
        last_service_hours: hours,
        last_service_date: f.date,
        cost,
        notes: f.notes || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.maintenance.save(maintenance);

      const completion: MaintenanceCompletion = {
        id: uuid(),
        business_id: business.id,
        machinery_id: machineId,
        maintenance_id: maintenanceId,
        date: f.date,
        hours,
        work_performed: f.work_performed || undefined,
        cost,
        notes: f.notes || undefined,
        created_at: new Date().toISOString(),
      };
      await repo.maintenanceCompletions.save(completion);

      // If the recorded hours are newer than the machine profile, update it too.
      if (machine && hours != null && (machine.current_hours == null || hours > machine.current_hours)) {
        await repo.machinery.save({ ...machine, current_hours: hours });
      }

      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Maintenance Record" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input
              label="Maintenance type*"
              value={f.maintenance_type}
              onChangeText={(v) => setF({ ...f, maintenance_type: v })}
              placeholder="e.g. 500 hour service, hydraulic repair"
              testID="input-maint-type"
            />
            <Input
              label="Machine hours"
              value={f.machine_hours}
              onChangeText={(v) => setF({ ...f, machine_hours: v })}
              keyboardType="decimal-pad"
              suffix="h"
              testID="input-machine-hours"
            />
            <Input
              label="Date*"
              value={f.date}
              onChangeText={(v) => setF({ ...f, date: v })}
              placeholder="YYYY-MM-DD"
              testID="input-maint-date"
            />
            <Input
              label="Approx cost"
              value={f.approx_cost}
              onChangeText={(v) => setF({ ...f, approx_cost: v })}
              keyboardType="decimal-pad"
              suffix="AUD"
              placeholder="Optional"
              testID="input-approx-cost"
            />
            <Input
              label="What was done?"
              value={f.work_performed}
              onChangeText={(v) => setF({ ...f, work_performed: v })}
              multiline
              placeholder="Describe the maintenance or repair work completed"
              testID="input-work-performed"
            />
            <Input
              label="Notes"
              value={f.notes}
              onChangeText={(v) => setF({ ...f, notes: v })}
              multiline
              placeholder="Anything else worth remembering"
              testID="input-notes"
            />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button
            title="Save Maintenance"
            icon="content-save-outline"
            onPress={save}
            loading={saving}
            disabled={saving || !f.maintenance_type.trim() || !f.date.trim()}
            testID="save-maint-btn"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
