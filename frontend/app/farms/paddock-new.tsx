import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Paddock } from "@/src/lib/types";

export default function NewPaddock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const [f, setF] = useState({ name: "", area: "", crop: "", variety: "", notes: "" });

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !farmId || !f.name.trim()) return;
    const p: Paddock = {
      id: uuid(),
      business_id: business.id,
      farm_id: farmId,
      name: f.name.trim(),
      area_ha: f.area ? parseFloat(f.area) : undefined,
      crop: f.crop.trim() || undefined,
      variety: f.variety.trim() || undefined,
      notes: f.notes.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.paddocks.save(p);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Paddock" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Paddock name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="input-paddock-name" />
            <Input label="Area" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" testID="input-paddock-area" />
            <Input label="Current crop" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} testID="input-paddock-crop" />
            <Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="input-paddock-variety" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-paddock-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Paddock" icon="content-save-outline" onPress={save} disabled={!f.name.trim()} testID="save-paddock-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
