import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { recordManualMovement } from "@/src/lib/stock";
import type { Chemical, ChemicalStockLine, StockMovementReason } from "@/src/lib/types";

const REASONS: StockMovementReason[] = ["Purchase", "Correction", "Spill", "Transfer", "Usage", "Other"];

export default function StockAdjust() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chemicalId } = useLocalSearchParams<{ chemicalId: string }>();
  const [chem, setChem] = useState<Chemical | null>(null);
  const [stockLines, setStockLines] = useState<ChemicalStockLine[]>([]);
  const [lineId, setLineId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<StockMovementReason>("Purchase");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!chemicalId) return;
    repo.chemicals.get(chemicalId as string).then(setChem);
    repo.chemicalStockLines.forChemical(chemicalId as string).then((lines) => setStockLines(lines.filter((l) => !l.archived_at)));
  }, [chemicalId]));

  const selectedLine = stockLines.find((l) => l.id === lineId) ?? null;

  async function save() {
    const q = parseFloat(qty);
    if (!chem || !q || q <= 0) return;
    setSaving(true);
    const delta = direction === "add" ? q : -q;
    await recordManualMovement(chem.id, delta, reason, notes.trim() || undefined, lineId ?? undefined);
    setSaving(false);
    router.back();
  }

  if (!chem) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Adjust Stock" back /></View>;

  const current = chem.stock_qty ?? 0;
  const q = parseFloat(qty) || 0;
  const preview = direction === "add" ? current + q : current - q;
  const willGoBelow = preview < 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Adjust Stock" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={styles.chemName}>{chem.product_name}</Text>
            <Text style={styles.currentStock}>Current stock: <Text style={{ fontWeight: "800" }}>{current} {chem.stock_unit ?? chem.pack_size ?? ""}</Text></Text>
          </Card>

          {stockLines.length > 0 ? (
            <>
              <View style={{ height: spacing.md }} />
              <Card>
                <Text style={styles.reasonLabel}>Which pack size? (optional)</Text>
                <View style={styles.reasonGrid}>
                  <Pressable onPress={() => setLineId(null)} style={[styles.reasonChip, lineId === null && styles.reasonChipActive]} testID="adjust-line-none">
                    <Text style={[styles.reasonText, lineId === null && { color: colors.onBrandPrimary }]}>Just the total</Text>
                  </Pressable>
                  {stockLines.map((l) => (
                    <Pressable key={l.id} onPress={() => setLineId(l.id)} style={[styles.reasonChip, lineId === l.id && styles.reasonChipActive]} testID={`adjust-line-${l.id}`}>
                      <Text style={[styles.reasonText, lineId === l.id && { color: colors.onBrandPrimary }]}>{l.pack_size}{l.location ? ` · ${l.location}` : ""}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>Pick a pack size to keep that line&apos;s own count in sync — useful for &quot;how many 20L drums do we have&quot; history later.</Text>
              </Card>
            </>
          ) : null}

          <View style={{ height: spacing.md }} />
          <Card>
            <View style={styles.toggleRow}>
              <Pressable onPress={() => setDirection("add")} style={[styles.toggle, direction === "add" && { backgroundColor: colors.success, borderColor: colors.success }]} testID="adjust-add-btn">
                <Icon name="plus" size={18} color={direction === "add" ? colors.onSuccess : colors.onSurface} />
                <Text style={[styles.toggleText, direction === "add" && { color: colors.onSuccess }]}>Add</Text>
              </Pressable>
              <Pressable onPress={() => setDirection("remove")} style={[styles.toggle, direction === "remove" && { backgroundColor: colors.error, borderColor: colors.error }]} testID="adjust-remove-btn">
                <Icon name="minus" size={18} color={direction === "remove" ? colors.onError : colors.onSurface} />
                <Text style={[styles.toggleText, direction === "remove" && { color: colors.onError }]}>Remove</Text>
              </Pressable>
            </View>

            <Input label={selectedLine ? `Quantity (number of ${selectedLine.pack_size} packs)` : "Quantity"} value={qty} onChangeText={setQty} keyboardType="decimal-pad" suffix={selectedLine ? "packs" : (chem.stock_unit ?? "packs")} testID="input-adjust-qty" />

            <Text style={styles.reasonLabel}>Reason</Text>
            <View style={styles.reasonGrid}>
              {REASONS.map((r) => (
                <Pressable key={r} onPress={() => setReason(r)} style={[styles.reasonChip, reason === r && styles.reasonChipActive]} testID={`reason-${r}`}>
                  <Text style={[styles.reasonText, reason === r && { color: colors.onBrandPrimary }]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <Input label="Notes" value={notes} onChangeText={setNotes} multiline testID="input-adjust-notes" />
          </Card>

          {q > 0 ? (
            <>
              <View style={{ height: spacing.md }} />
              <Card style={{ backgroundColor: willGoBelow ? "#FEE2E2" : colors.brandSecondary, borderColor: willGoBelow ? colors.error : colors.brandPrimary }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: willGoBelow ? colors.error : colors.onBrandSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Preview</Text>
                <Text style={{ fontSize: 16, color: willGoBelow ? colors.error : colors.onBrandSecondary, fontWeight: "700" }}>
                  {current} → {Math.round(preview * 100) / 100} {chem.stock_unit ?? ""}
                </Text>
                {willGoBelow ? <Text style={{ fontSize: 12, color: colors.error, marginTop: 6, fontWeight: "700" }}>⚠ Stock will drop below zero.</Text> : null}
              </Card>
            </>
          ) : null}

          <View style={{ height: spacing.md }} />
          <Button title={saving ? "Saving…" : `${direction === "add" ? "Add" : "Remove"} Stock`} icon="content-save-outline" onPress={save} loading={saving} disabled={!q} testID="save-adjust-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  chemName: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  currentStock: { fontSize: 14, color: colors.muted, marginTop: 4 },
  toggleRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  toggle: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  toggleText: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  reasonLabel: { fontSize: 12, color: colors.muted, marginBottom: 6, fontWeight: "600" },
  reasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  reasonChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  reasonChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  reasonText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", lineHeight: 17, marginTop: 6 },
});
