import { useState } from "react";
import { View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Machinery } from "@/src/lib/types";

export default function NewMachine() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [f, setF] = useState({ name: "", make: "", model: "", year: "", serial_number: "", registration: "", current_hours: "", purchase_date: "", notes: "" });

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !f.name.trim()) return;
    const m: Machinery = {
      id: uuid(),
      business_id: business.id,
      name: f.name.trim(),
      make: f.make || undefined,
      model: f.model || undefined,
      year: f.year ? parseInt(f.year) : undefined,
      serial_number: f.serial_number || undefined,
      registration: f.registration || undefined,
      current_hours: f.current_hours ? parseFloat(f.current_hours) : undefined,
      purchase_date: f.purchase_date || undefined,
      notes: f.notes || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.machinery.save(m);
    router.replace({ pathname: "/machinery/[id]", params: { id: m.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Machine" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Machine name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="input-machine-name" />
            <Input label="Make" value={f.make} onChangeText={(v) => setF({ ...f, make: v })} testID="input-make" />
            <Input label="Model" value={f.model} onChangeText={(v) => setF({ ...f, model: v })} testID="input-model" />
            <Input label="Year" value={f.year} onChangeText={(v) => setF({ ...f, year: v })} keyboardType="numeric" testID="input-year" />
            <Input label="Serial number" value={f.serial_number} onChangeText={(v) => setF({ ...f, serial_number: v })} testID="input-serial" />
            <Input label="Registration" value={f.registration} onChangeText={(v) => setF({ ...f, registration: v })} testID="input-rego" />
            <Input label="Current hours / km" value={f.current_hours} onChangeText={(v) => setF({ ...f, current_hours: v })} keyboardType="decimal-pad" testID="input-hours" />
            <Input label="Purchase date (YYYY-MM-DD)" value={f.purchase_date} onChangeText={(v) => setF({ ...f, purchase_date: v })} testID="input-purchase" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Machine" icon="content-save-outline" onPress={save} testID="save-machine-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
