import { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Chemical } from "@/src/lib/types";

export default function Documents() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Chemical[]>([]);

  useFocusEffect(useCallback(() => { repo.chemicals.active().then((l) => setItems(l.sort((a, b) => a.product_name.localeCompare(b.product_name)))); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Labels & SDS" back />
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<Card><Text style={styles.empty}>No chemicals in your register.</Text></Card>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }} testID={`docs-row-${item.id}`}>
            <Text style={styles.name}>{item.product_name}</Text>
            {item.active_ingredient ? <Text style={styles.ai}>{item.active_ingredient}</Text> : null}
            <View style={styles.btnRow}>
              <Pressable
                onPress={() => item.label_url && Linking.openURL(item.label_url)}
                disabled={!item.label_url}
                style={[styles.docBtn, !item.label_url && styles.docBtnDisabled]}
                testID={`label-btn-${item.id}`}
              >
                <Icon name="file-document-outline" size={18} color={item.label_url ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.docBtnText, !item.label_url && { color: colors.muted }]}>{item.label_url ? "View Label" : "No Label URL"}</Text>
                {item.label_url ? <Icon name="open-in-new" size={14} color={colors.muted} /> : null}
              </Pressable>
              <Pressable
                onPress={() => item.sds_url && Linking.openURL(item.sds_url)}
                disabled={!item.sds_url}
                style={[styles.docBtn, !item.sds_url && styles.docBtnDisabled]}
                testID={`sds-btn-${item.id}`}
              >
                <Icon name="shield-outline" size={18} color={item.sds_url ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.docBtnText, !item.sds_url && { color: colors.muted }]}>{item.sds_url ? "View SDS" : "No SDS URL"}</Text>
                {item.sds_url ? <Icon name="open-in-new" size={14} color={colors.muted} /> : null}
              </Pressable>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  ai: { fontSize: 12, color: colors.muted, marginTop: 2 },
  btnRow: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  docBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brandSecondary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 10 },
  docBtnDisabled: { backgroundColor: colors.surfaceTertiary, borderColor: colors.border },
  docBtnText: { fontSize: 13, fontWeight: "700", color: colors.onBrandSecondary },
  empty: { color: colors.muted, textAlign: "center" },
});
