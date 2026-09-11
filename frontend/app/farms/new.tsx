import { useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { geocodeAddress } from "@/src/lib/geocoding";
import { supabase } from "@/src/lib/supabase";
import type { Farm } from "@/src/lib/types";

export default function NewFarm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [name, setName] = useState("");
  const [property, setProperty] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinNote, setPinNote] = useState<string | null>(null);

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !name.trim()) return;
    setBusy(true);
    setPinNote(null);
    try {
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

      // Geocode the address (free via OSM Nominatim) and drop a weather_locations
      // pin so the map / weather has a coordinate before any paddock boundary
      // is drawn.
      const q = [address.trim(), property.trim()].filter(Boolean).join(", ");
      if (q) {
        try {
          const geo = await geocodeAddress(q);
          if (geo) {
            await supabase.from("weather_locations").insert({
              business_id: business.id,
              farm_id: farm.id,
              lat: geo.lat,
              lon: geo.lon,
              label: farm.name,
              is_active: true,
            });
            setPinNote(`✓ Map pin dropped at ${geo.lat.toFixed(3)}, ${geo.lon.toFixed(3)}`);
          }
        } catch (e) {
          console.warn("geocode failed", e);
        }
      }

      router.replace({ pathname: "/farms/[id]", params: { id: farm.id } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Farm" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Farm name*" value={name} onChangeText={setName} testID="input-farm-name" />
            <Input label="Area / State" value={property} onChangeText={setProperty} placeholder="e.g. Wimmera, VIC" testID="input-farm-property" />
            <Input label="Address (optional)" value={address} onChangeText={setAddress} placeholder="123 Somewhere Rd, Town" multiline testID="input-farm-address" />
            <Text style={styles.hint}>An address here drops a map pin so the Weather tab works straight away.</Text>
            <Input label="Notes" value={notes} onChangeText={setNotes} multiline testID="input-farm-notes" />
          </Card>
          {pinNote ? <Text style={styles.pinNote}>{pinNote}</Text> : null}
          <View style={{ height: spacing.md }} />
          <Button title="Save Farm" icon="content-save-outline" onPress={save} disabled={!name.trim()} loading={busy} testID="save-farm-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 11, color: colors.muted, fontStyle: "italic", marginTop: 2, marginBottom: 4 },
  pinNote: { fontSize: 12, fontWeight: "700", color: colors.brandPrimary, textAlign: "center", marginTop: 8 },
});
