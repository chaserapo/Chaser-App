import { useCallback, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { LINK_CATEGORIES, LinkCategory } from "@/src/lib/links";
import type { ExternalLink } from "@/src/lib/types";

export default function EditLink() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [link, setLink] = useState<ExternalLink | null>(null);
  const [category, setCategory] = useState<LinkCategory>("Spray Application");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const l = await repo.links.get(id as string);
      setLink(l);
      if (l) {
        setCategory((l.category as LinkCategory) ?? "Spray Application");
        setName(l.name); setUrl(l.url); setDescription(l.description ?? "");
      }
    })();
  }, [id]));

  async function save() {
    if (!link || !name.trim() || !url.trim()) return;
    await repo.links.save({ ...link, category, name: name.trim(), url: url.trim(), description: description.trim() || undefined });
    router.back();
  }
  async function remove() {
    if (!link) return;
    await repo.links.remove(link.id);
    router.back();
  }

  if (!link) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Link" back /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Edit Link" back />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={styles.label}>Category</Text>
            <View style={styles.catRow}>
              {LINK_CATEGORIES.map((c) => (
                <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, category === c && styles.catChipActive]} testID={`cat-chip-${c}`}>
                  <Text style={[styles.catText, category === c && { color: colors.onBrandPrimary }]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="Name*" value={name} onChangeText={setName} testID="edit-link-name" />
            <Input label="URL*" value={url} onChangeText={setUrl} testID="edit-link-url" />
            <Input label="Short description" value={description} onChangeText={setDescription} testID="edit-link-desc" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Changes" icon="content-save-outline" onPress={save} disabled={!name.trim() || !url.trim()} testID="save-link-edit-btn" />
          <View style={{ height: spacing.sm }} />
          <Button title="Delete Link" icon="trash-can-outline" variant="danger" onPress={remove} testID="delete-link-btn" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary, marginBottom: 8 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.md },
  catChip: { paddingHorizontal: 12, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  catChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  catText: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary },
});
