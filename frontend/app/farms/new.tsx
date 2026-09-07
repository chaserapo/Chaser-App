import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Farm } from "@/src/lib/types";

export default function NewFarm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [property, setProperty] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !name.trim()) return;
    const farm: Farm = {
      id: uuid(),
      business_id: business.id,
      name: name.trim(),
      property_name: property.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.farms.save(farm);
    router.replace({ pathname: "/farms/[id]", params: { id: farm.id } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Farm" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Farm name*" value={name} onChangeText={setName} testID="input-farm-name" />
            <Input label="Property / location name" value={property} onChangeText={setProperty} testID="input-farm-property" />
            <Input label="Address (optional)" value={address} onChangeText={setAddress} multiline testID="input-farm-address" />
            <Input label="Notes" value={notes} onChangeText={setNotes} multiline testID="input-farm-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Farm" icon="content-save-outline" onPress={save} disabled={!name.trim()} testID="save-farm-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
