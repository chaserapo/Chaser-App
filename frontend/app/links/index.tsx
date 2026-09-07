import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { LINK_CATEGORIES } from "@/src/lib/links";
import type { ExternalLink } from "@/src/lib/types";

export default function LinksManage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [links, setLinks] = useState<ExternalLink[]>([]);

  useFocusEffect(useCallback(() => { repo.links.list().then((l) => setLinks(l.sort((a, b) => a.name.localeCompare(b.name)))); }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Manage Links" back right={
        <Pressable onPress={() => router.push("/links/new")} testID="add-link-header-btn">
          <Icon name="plus" size={24} color={colors.brandPrimary} />
        </Pressable>
      } />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {links.length === 0 ? (
          <Card>
            <Text style={styles.empty}>No links yet.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Add Your First Link" icon="plus" onPress={() => router.push("/links/new")} testID="empty-add-link-btn" />
          </Card>
        ) : (
          LINK_CATEGORIES.map((cat) => {
            const inCat = links.filter((l) => l.category === cat);
            if (inCat.length === 0) return null;
            return (
              <View key={cat}>
                <Text style={styles.section}>{cat}</Text>
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  {inCat.map((l, i) => (
                    <Pressable
                      key={l.id}
                      onPress={() => router.push({ pathname: "/links/[id]", params: { id: l.id } })}
                      testID={`link-row-${l.id}`}
                      style={({ pressed }) => [styles.row, i < inCat.length - 1 && styles.rowBorder, pressed && { backgroundColor: colors.surface }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{l.name}</Text>
                        {l.description ? <Text style={styles.rowSub}>{l.description}</Text> : null}
                        <Text style={styles.rowUrl} numberOfLines={1}>{l.url}</Text>
                      </View>
                      <Pressable onPress={() => Linking.openURL(l.url)} style={styles.openBtn} testID={`open-link-${l.id}`}>
                        <Icon name="open-in-new" size={18} color={colors.brandPrimary} />
                      </Pressable>
                      <Icon name="pencil" size={18} color={colors.muted} />
                    </Pressable>
                  ))}
                </Card>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "700", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rowUrl: { fontSize: 11, color: colors.brandPrimary, marginTop: 3 },
  openBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center" },
});
