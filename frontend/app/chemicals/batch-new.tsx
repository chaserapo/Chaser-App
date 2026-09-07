import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { ChemicalBatch } from "@/src/lib/types";

export default function NewBatch() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chemicalId } = useLocalSearchParams<{ chemicalId: string }>();
  const [f, setF] = useState({ batch_number: "", quantity: "", unit: "L", purchase_date: "", expiry_date: "", notes: "" });

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !chemicalId || !f.batch_number.trim()) return;
    const b: ChemicalBatch = {
      id: uuid(),
      business_id: business.id,
      chemical_id: chemicalId,
      batch_number: f.batch_number.trim(),
      quantity: f.quantity ? parseFloat(f.quantity) : undefined,
      unit: f.unit.trim() || undefined,
      purchase_date: f.purchase_date || undefined,
      expiry_date: f.expiry_date || undefined,
      notes: f.notes || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.chemicalBatches.save(b);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Batch" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Batch / lot number*" value={f.batch_number} onChangeText={(v) => setF({ ...f, batch_number: v })} testID="input-batch-num" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Input label="Quantity" value={f.quantity} onChangeText={(v) => setF({ ...f, quantity: v })} keyboardType="decimal-pad" testID="input-batch-qty" /></View>
              <View style={{ flex: 1 }}><Input label="Unit" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} placeholder="L, kg, mL, g" testID="input-batch-unit" /></View>
            </View>
            <Input label="Purchase date (YYYY-MM-DD)" value={f.purchase_date} onChangeText={(v) => setF({ ...f, purchase_date: v })} testID="input-batch-purchase" />
            <Input label="Expiry date (YYYY-MM-DD)" value={f.expiry_date} onChangeText={(v) => setF({ ...f, expiry_date: v })} testID="input-batch-expiry" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-batch-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Batch" icon="content-save-outline" onPress={save} disabled={!f.batch_number.trim()} testID="save-batch-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
