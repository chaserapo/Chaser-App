import { useCallback, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Paddock } from "@/src/lib/types";

export default function EditPaddock() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [paddock, setPaddock] = useState<Paddock | null>(null);
  const [f, setF] = useState({ name: "", area: "", crop: "", variety: "", notes: "" });

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const list = await repo.paddocks.list();
      const p = list.find((x) => x.id === id) ?? null;
      setPaddock(p);
      if (p) setF({ name: p.name, area: p.area_ha != null ? p.area_ha.toString() : "", crop: p.crop ?? "", variety: p.variety ?? "", notes: p.notes ?? "" });
    })();
  }, [id]));

  async function save() {
    if (!paddock || !f.name.trim()) return;
    const next: Paddock = {
      ...paddock,
      name: f.name.trim(),
      area_ha: f.area ? parseFloat(f.area) : undefined,
      crop: f.crop.trim() || undefined,
      variety: f.variety.trim() || undefined,
      notes: f.notes.trim() || undefined,
    };
    await repo.paddocks.save(next);
    router.back();
  }

  async function archive() {
    if (!paddock) return;
    await repo.paddocks.save({ ...paddock, archived_at: new Date().toISOString() });
    router.back();
  }
  async function unarchive() {
    if (!paddock) return;
    await repo.paddocks.save({ ...paddock, archived_at: undefined });
    router.back();
  }

  if (!paddock) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Paddock" back /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Edit Paddock" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          {paddock.archived_at ? <View style={styles.archBadge}><Text style={styles.archText}>Archived</Text></View> : null}
          <Card>
            <Input label="Paddock name*" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} testID="edit-paddock-name" />
            <Input label="Area" value={f.area} onChangeText={(v) => setF({ ...f, area: v })} keyboardType="decimal-pad" suffix="ha" testID="edit-paddock-area" />
            <Input label="Current crop" value={f.crop} onChangeText={(v) => setF({ ...f, crop: v })} testID="edit-paddock-crop" />
            <Input label="Variety" value={f.variety} onChangeText={(v) => setF({ ...f, variety: v })} testID="edit-paddock-variety" />
            <Input label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline testID="edit-paddock-notes" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Changes" icon="content-save-outline" onPress={save} disabled={!f.name.trim()} testID="save-paddock-edit-btn" />
          <View style={{ height: spacing.sm }} />
          {paddock.archived_at ? (
            <Button title="Unarchive Paddock" icon="archive-arrow-up-outline" variant="secondary" onPress={unarchive} testID="unarchive-paddock-btn" />
          ) : (
            <Button title="Archive Paddock" icon="archive-outline" variant="danger" onPress={archive} testID="archive-paddock-btn" />
          )}
          <Text style={styles.hint}>Archiving keeps history intact and hides the paddock from spray-job selection. Existing spray records keep their historical values.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  archBadge: { alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginBottom: spacing.md },
  archText: { fontSize: 11, fontWeight: "800", color: colors.onSurfaceTertiary, textTransform: "uppercase" },
  hint: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.md, fontStyle: "italic", lineHeight: 17 },
});
