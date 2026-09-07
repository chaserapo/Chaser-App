import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical } from "@/src/lib/types";

export default function ChemicalDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [c, setC] = useState<Chemical | null>(null);

  useFocusEffect(useCallback(() => { if (id) repo.chemicals.get(id).then(setC); }, [id]));

  if (!c) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Chemical" back /></View>;
  }

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? "—"}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={c.product_name} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <Field label="Active ingredient" value={c.active_ingredient} />
          <Field label="APVMA registration" value={c.apvma_number} />
          <Field label="Chemical group" value={c.chemical_group} />
          <Field label="Formulation" value={c.formulation} />
          <Field label="Default rate" value={c.default_rate ? `${c.default_rate} ${c.default_unit ?? ""}` : undefined} />
          <Field label="Pack size" value={c.pack_size} />
          <Field label="Stock quantity" value={c.stock_qty} />
        </Card>

        {(c.label_url || c.sds_url) && (
          <>
            <View style={{ height: spacing.md }} />
            <Card style={{ padding: 0, overflow: "hidden" }}>
              {c.label_url ? (
                <Pressable onPress={() => Linking.openURL(c.label_url!)} style={styles.linkRow} testID="chem-label-link">
                  <Icon name="file-document-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.linkText}>Product Label</Text>
                  <Icon name="open-in-new" size={20} color={colors.muted} />
                </Pressable>
              ) : null}
              {c.sds_url ? (
                <Pressable onPress={() => Linking.openURL(c.sds_url!)} style={[styles.linkRow, { borderTopWidth: c.label_url ? 1 : 0, borderTopColor: colors.border }]} testID="chem-sds-link">
                  <Icon name="shield-outline" size={22} color={colors.brandPrimary} />
                  <Text style={styles.linkText}>Safety Data Sheet</Text>
                  <Icon name="open-in-new" size={20} color={colors.muted} />
                </Pressable>
              ) : null}
            </Card>
          </>
        )}

        {c.notes ? (
          <>
            <View style={{ height: spacing.md }} />
            <Card>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notes}>{c.notes}</Text>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  linkRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, minHeight: 56, gap: 12 },
  linkText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.onSurface },
  notesLabel: { fontSize: 12, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  notes: { fontSize: 14, color: colors.onSurface, marginTop: 6, lineHeight: 20 },
});
