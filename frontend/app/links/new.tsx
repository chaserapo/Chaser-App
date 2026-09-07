import { useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { v4 as uuid } from "uuid";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, Input } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { LINK_CATEGORIES, LinkCategory } from "@/src/lib/links";
import type { ExternalLink } from "@/src/lib/types";

export default function NewLink() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<LinkCategory>("Spray Application");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [description, setDescription] = useState("");

  async function save() {
    const business = await repo.getBusiness();
    if (!business || !name.trim() || !url.trim()) return;
    const link: ExternalLink = {
      id: uuid(),
      business_id: business.id,
      category,
      name: name.trim(),
      url: url.trim(),
      description: description.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    await repo.links.save(link);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="New Link" back />
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
            <Input label="Name*" value={name} onChangeText={setName} testID="input-link-name" />
            <Input label="URL*" value={url} onChangeText={setUrl} testID="input-link-url" />
            <Input label="Short description" value={description} onChangeText={setDescription} testID="input-link-desc" />
          </Card>
          <View style={{ height: spacing.md }} />
          <Button title="Save Link" icon="content-save-outline" onPress={save} disabled={!name.trim() || !url.trim()} testID="save-link-btn" />
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
