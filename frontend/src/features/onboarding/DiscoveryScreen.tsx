import { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/src/components/ui";
import { supabase } from "@/src/lib/supabase";
import { colors, radius, spacing } from "@/src/theme";

const SOURCES = [
  "Friend / another farmer",
  "Work / industry contact",
  "Facebook / social media",
  "Field day / event",
  "Dealer / ag retailer",
  "App Store / search",
  "Other",
] as const;

const REASONS = [
  "Farm records & jobs",
  "Spraying & spray tools",
  "Machinery & maintenance",
  "Paddock mapping",
  "Team coordination",
  "Faults & risks",
  "Just checking it out",
] as const;

const discoveryKey = (userId: string | null) => ["user_discovery", userId] as const;

export function useDiscoveryGate(userId: string | null) {
  return useQuery({
    queryKey: discoveryKey(userId),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return { completed: true };
      const { data, error } = await supabase
        .from("user_profiles")
        .select("discovery_completed_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return { completed: !!data?.discovery_completed_at };
    },
  });
}

function TickRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tickRow, active && styles.tickRowActive]}>
      <Icon
        name={active ? "checkbox-marked" : "checkbox-blank-outline"}
        size={24}
        color={active ? colors.brandPrimary : colors.muted}
      />
      <Text style={[styles.tickText, active && styles.tickTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function DiscoveryScreen({ userId }: { userId: string }) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [sources, setSources] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = sources.length > 0 && reasons.length > 0 && !saving;

  function toggle(value: string, values: string[], setValues: (next: string[]) => void) {
    setValues(values.includes(value) ? values.filter((x) => x !== value) : [...values, value]);
  }

  async function save() {
    if (!canContinue) return;
    setSaving(true);
    setError(null);
    try {
      const { error: saveError } = await supabase
        .from("user_profiles")
        .upsert(
          {
            user_id: userId,
            heard_about_us: sources,
            download_reasons: reasons,
            discovery_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (saveError) throw saveError;
      await qc.invalidateQueries({ queryKey: discoveryKey(userId) });
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save your answer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectedSummary = useMemo(() => sources.length + reasons.length, [sources.length, reasons.length]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.iconWrap}>
          <Icon name="sprout-outline" size={34} color={colors.brandPrimary} />
        </View>
        <Text style={styles.eyebrow}>ONE QUICK THING</Text>
        <Text style={styles.title}>How did you hear about Chaser?</Text>
        <Text style={styles.body}>This helps us understand who is finding Chaser and what they want it for. Tick anything that applies.</Text>

        <Text style={styles.section}>How did you hear about us?</Text>
        <View style={styles.group}>
          {SOURCES.map((source) => (
            <TickRow
              key={source}
              label={source}
              active={sources.includes(source)}
              onPress={() => toggle(source, sources, setSources)}
            />
          ))}
        </View>

        <Text style={styles.section}>What made you download Chaser?</Text>
        <View style={styles.group}>
          {REASONS.map((reason) => (
            <TickRow
              key={reason}
              label={reason}
              active={reasons.includes(reason)}
              onPress={() => toggle(reason, reasons, setReasons)}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ height: spacing.lg }} />
        <Button
          title={saving ? "Saving…" : "Continue to setup"}
          icon="arrow-right"
          onPress={save}
          disabled={!canContinue}
          loading={saving}
          testID="discovery-continue-btn"
        />
        {!saving && selectedSummary === 0 ? <Text style={styles.hint}>Choose at least one option in each section.</Text> : null}
        {saving ? <ActivityIndicator style={{ marginTop: spacing.sm }} color={colors.brandPrimary} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceSecondary },
  content: { padding: spacing.lg, maxWidth: 680, width: "100%", alignSelf: "center" },
  iconWrap: { width: 62, height: 62, borderRadius: 18, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
  eyebrow: { marginTop: spacing.lg, color: colors.brandPrimary, fontWeight: "800", fontSize: 12, letterSpacing: 1.1 },
  title: { marginTop: 6, color: colors.onSurface, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  body: { marginTop: spacing.sm, color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm, color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  group: { gap: 8 },
  tickRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, minHeight: 52, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tickRowActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondary },
  tickText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurfaceTertiary },
  tickTextActive: { color: colors.onSurface },
  error: { marginTop: spacing.md, color: colors.error, fontSize: 13, fontWeight: "700" },
  hint: { marginTop: spacing.sm, textAlign: "center", color: colors.muted, fontSize: 12 },
});
