import { useState } from "react";
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Maintenance } from "@/src/lib/types";

export default function NewMaintenance() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [f, setF] = useState({ maintenance_type: "", service_interval_hours: "", last_service_hours: "", next_service_hours: "", last_service_date: "", cost: "", parts_used: "", notes: "" });

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !machineId || !f.maintenance_type.trim()) return;
    const m: Maintenance = {
      id: uuid(),
      business_id: business.id,
      machinery_id: machineId,
      maintenance_type: f.maintenance_type.trim(),
      service_interval_hours: f.service_interval_hours ? parseFloat(f.service_interval_hours) : undefined,
      last_service_hours: f.last_service_hours ? parseFloat(f.last_service_hours) : undefined,
      next_service_hours: f.next_service_hours ? parseFloat(f.next_service_hours) : undefined,
      last_service_date: f.last_service_date || undefined,
      cost: f.cost ? parseFloat(f.cost) : undefined,
      parts_used: f.parts_used || undefined,
      notes: f.notes || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.maintenance.save(m);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Maintenance Record" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Maintenance type*" value={f.maintenance_type} onChangeText={(v) => setF({ ...f, maintenance_type: v })} testID="input-maint-type" />
            <Input label="Service interval (hours)" value={f.service_interval_hours} onChangeText={(v) => setF({ ...f, service_interval_hours: v })} keyboardType="decimal-pad" testID="input-interval" />
            <Input label="Last service hours" value={f.last_service_hours} onChangeText={(v) => setF({ ...f, last_service_hours: v })} keyboardType="decimal-pad" testID="input-last-hours" />
            <Input label="Next service hours" value={f.next_service_hours} onChangeText={(v) => setF({ ...f, next_service_hours: v })} keyboardType="decimal-pad" testID="input-next-hours" />
            <Input label="Last service date (YYYY-MM-DD)" value={f.last_service_date} onChangeText={(v) => setF({ ...f, last_service_date: v })} testID="input-last-date" />
            <Input label="Cost" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} keyboardType="decimal-pad" suffix="AUD" testID="input-cost" />
            <Input label="Parts used" value={f.parts_used} onChangeText={(v) => setF({ ...f, parts_used: v })} multiline testID="input-parts" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Maintenance" icon="content-save-outline" onPress={save} testID="save-maint-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
