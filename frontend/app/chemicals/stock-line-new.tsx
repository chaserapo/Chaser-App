import { useEffect, useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { confirm } from "@/src/lib/confirm";
import type { ChemicalStockLine } from "@/src/lib/types";

export default function StockLineForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chemicalId, lineId } = useLocalSearchParams<{ chemicalId: string; lineId?: string }>();
  const [f, setF] = useState({ pack_size: "", qty: "", location: "", low_stock_threshold: "", notes: "" });
  const [loaded, setLoaded] = useState(!lineId);

  useEffect(() => {
    if (!lineId || !chemicalId) return;
    repo.chemicalStockLines.forChemical(chemicalId).then((lines) => {
      const l = lines.find((x) => x.id === lineId);
      if (l) {
        setF({
          pack_size: l.pack_size,
          qty: String(l.qty),
          location: l.location ?? "",
          low_stock_threshold: l.low_stock_threshold != null ? String(l.low_stock_threshold) : "",
          notes: l.notes ?? "",
        });
      }
      setLoaded(true);
    });
  }, [lineId, chemicalId]);

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !chemicalId || !f.pack_size.trim()) return;
    const line: ChemicalStockLine = {
      id: lineId ?? uuid(),
      business_id: business.id,
      chemical_id: chemicalId,
      pack_size: f.pack_size.trim(),
      qty: f.qty ? parseFloat(f.qty) : 0,
      location: f.location.trim() || undefined,
      low_stock_threshold: f.low_stock_threshold ? parseFloat(f.low_stock_threshold) : undefined,
      notes: f.notes.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.chemicalStockLines.save(line);
    router.back();
  }

  function confirmDelete() {
    if (!lineId) return;
    confirm({
      title: "Remove this pack size?",
      message: "This removes the line and its recorded quantity. This can't be undone.",
      confirmLabel: "Remove",
      destructive: true,
    }, async () => {
      await repo.chemicalStockLines.remove(lineId);
      router.back();
    });
  }

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Pack Size" back /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={lineId ? "Edit Pack Size" : "Add Pack Size"} back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Input label="Pack size*" value={f.pack_size} onChangeText={(v) => setF({ ...f, pack_size: v })} placeholder="e.g. 20 L, 110 L, 25 kg" testID="input-line-pack-size" />
            <Input label="Quantity on hand" value={f.qty} onChangeText={(v) => setF({ ...f, qty: v })} keyboardType="decimal-pad" placeholder="How many of this pack size" testID="input-line-qty" />
            <Input label="Location" value={f.location} onChangeText={(v) => setF({ ...f, location: v })} placeholder="e.g. Shed 2" testID="input-line-location" />
            <Input label="Low stock warning (optional)" value={f.low_stock_threshold} onChangeText={(v) => setF({ ...f, low_stock_threshold: v })} keyboardType="decimal-pad" placeholder="Number of packs" testID="input-line-low-stock" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="input-line-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save" icon="content-save-outline" onPress={save} disabled={!f.pack_size.trim()} testID="save-line-btn" />
          {lineId ? (
            <>
              <View style={{ height: spacing.sm }} />
              <Pressable onPress={confirmDelete} style={{ alignItems: "center", paddingVertical: spacing.sm }} testID="delete-line-btn">
                <Text style={{ color: colors.error, fontWeight: "700", fontSize: 13 }}>Remove this pack size</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
