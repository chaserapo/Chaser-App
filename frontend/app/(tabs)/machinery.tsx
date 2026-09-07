import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import type { Machinery, Maintenance } from "@/src/lib/types";

export default function MachineryTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<(Machinery & { status: "good" | "due_soon" | "overdue"; nextService?: number })[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [m, ms] = await Promise.all([repo.machinery.list(), repo.maintenance.list()]);
      const enriched = m.map((x) => {
        const machMaints = ms.filter((mm) => mm.machinery_id === x.id);
        const next = machMaints.reduce<number | undefined>((min, mn) => {
          if (mn.next_service_hours == null) return min;
          return min == null || mn.next_service_hours < min ? mn.next_service_hours : min;
        }, undefined);
        return { ...x, status: maintenanceStatus(x.current_hours, next), nextService: next };
      });
      setList(enriched);
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Machinery</Text>
          <Text style={styles.sub}>{list.length} machine{list.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable onPress={() => router.push("/machinery/new")} style={styles.newBtn} testID="new-machinery-btn">
          <Icon name="plus" size={20} color={colors.onBrandPrimary} />
          <Text style={styles.newBtnText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No machinery yet.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Add Your First Machine" icon="plus" onPress={() => router.push("/machinery/new")} testID="empty-add-machine-btn" />
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing.md }} onPress={() => router.push({ pathname: "/machinery/[id]", params: { id: item.id } })} testID={`machine-card-${item.id}`}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.iconBox}>
                <Icon name="tractor-variant" size={26} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.make ?? ""} {item.model ?? ""}</Text>
                <Text style={styles.hours}>{item.current_hours ?? 0} h{item.nextService ? `  ·  next @ ${item.nextService}h` : ""}</Text>
              </View>
              <StatusBadge status={item.status} testID={`machine-status-${item.id}`} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  newBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brandPrimary, paddingHorizontal: 14, height: 40, borderRadius: 999 },
  newBtnText: { color: colors.onBrandPrimary, fontWeight: "700", marginLeft: 6 },
  iconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  hours: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
});
