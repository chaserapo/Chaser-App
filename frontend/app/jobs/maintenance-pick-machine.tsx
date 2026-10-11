import { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, Button } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { Machinery } from "@/src/lib/types";

function iconForType(t?: string): string {
  switch (t) {
    case "Self-propelled sprayer":
    case "Tow-behind sprayer":
      return "sprinkler-variant";
    case "Header/Harvester":
      return "combine-harvester";
    case "Air seeder":
    case "Spreader":
      return "grain";
    case "Ute/Vehicle":
      return "car-pickup";
    case "Implement":
      return "hammer-wrench";
    default:
      return "tractor-variant";
  }
}

// Entry point for the "Maintenance / Repair" job type: pick which machine
// this is for, then go straight into logging a service or repair against it
// (app/machinery/service-new.tsx handles both - a recurring service type or
// a one-off repair).
export default function PickMachineForMaintenance() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [machines, setMachines] = useState<Machinery[]>([]);

  useFocusEffect(useCallback(() => {
    repo.machinery.list().then((m) => setMachines(m.filter((x) => !x.archived_at).sort((a, b) => a.name.localeCompare(b.name))));
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Maintenance / Repair" back />
      <FlatList
        data={machines}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        ListHeaderComponent={<Text style={styles.sub}>Which machine is this for?</Text>}
        ListEmptyComponent={
          <Card>
            <Text style={styles.empty}>No machinery yet.</Text>
            <View style={{ height: spacing.md }} />
            <Button title="Add Your First Machine" icon="plus" onPress={() => router.push("/machinery/new")} testID="empty-add-machine-btn" />
          </Card>
        }
        renderItem={({ item }) => (
          <Card
            style={{ marginBottom: spacing.sm }}
            onPress={() => router.push({ pathname: "/machinery/service-new", params: { machineId: item.id } })}
            testID={`pick-machine-${item.id}`}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.iconBox}>
                <Icon name={iconForType(item.machine_type) as any} size={24} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{[item.make, item.model].filter(Boolean).join(" ") || item.machine_type || "—"}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.muted} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 13, color: colors.muted, marginBottom: spacing.md },
  empty: { color: colors.muted, textAlign: "center", fontSize: 14 },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  meta: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
