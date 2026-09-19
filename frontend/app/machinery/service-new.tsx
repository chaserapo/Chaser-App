import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import { SERVICE_TYPE_PRESETS } from "@/src/lib/service-types";
import type { Machinery, Maintenance } from "@/src/lib/types";

// Entry point for "+ Add" under Maintenance Schedule on a machine. Rather than
// always creating a brand new schedule type, this lets the user log against a
// type the machine already has, start a new recurring type (optionally from a
// common preset), or record a one-off repair that isn't on a recurring
// interval at all.
export default function ServiceNew() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [machine, setMachine] = useState<Machinery | null>(null);
  const [existing, setExisting] = useState<Maintenance[]>([]);

  useFocusEffect(useCallback(() => {
    if (!machineId) return;
    (async () => {
      const [mach, mm] = await Promise.all([repo.machinery.get(machineId), repo.maintenance.forMachine(machineId)]);
      setMachine(mach);
      setExisting(mm.sort((a, b) => a.maintenance_type.localeCompare(b.maintenance_type)));
    })();
  }, [machineId]));

  const existingNames = new Set(existing.map((m) => m.maintenance_type.toLowerCase()));
  const availablePresets = SERVICE_TYPE_PRESETS.filter((p) => !existingNames.has(p.name.toLowerCase()));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Log Service" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        {existing.length > 0 ? (
          <>
            <Text style={styles.section}>This machine&apos;s service types</Text>
            {existing.map((mn) => {
              const status = maintenanceStatus(machine?.current_hours, mn.next_service_hours);
              return (
                <Card
                  key={mn.id}
                  style={{ marginBottom: spacing.sm }}
                  onPress={() => router.push({ pathname: "/machinery/maintenance-complete", params: { machineId, maintenanceId: mn.id } })}
                  testID={`service-existing-${mn.id}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{mn.maintenance_type}</Text>
                      <Text style={styles.rowMeta}>
                        {mn.service_interval_hours ? `Every ${mn.service_interval_hours}h` : "No interval set"} · Last: {mn.last_service_hours ?? "—"}h
                      </Text>
                    </View>
                    <StatusBadge status={status} />
                  </View>
                </Card>
              );
            })}
          </>
        ) : null}

        <Text style={styles.section}>Start a new recurring service type</Text>
        <View style={styles.grid}>
          {availablePresets.map((p) => (
            <Pressable
              key={p.name}
              onPress={() => router.push({
                pathname: "/machinery/maintenance-new",
                params: { machineId, presetName: p.name, presetInterval: String(p.intervalHours) },
              })}
              style={styles.preset}
              testID={`service-preset-${p.name}`}
            >
              <Icon name={p.icon as any} size={20} color={colors.brandPrimary} />
              <Text style={styles.presetText}>{p.name}</Text>
              <Text style={styles.presetInterval}>Every {p.intervalHours}h</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => router.push({ pathname: "/machinery/maintenance-new", params: { machineId } })}
            style={styles.preset}
            testID="service-preset-custom"
          >
            <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.presetText}>Custom type…</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>Not on a schedule?</Text>
        <Card
          onPress={() => router.push({ pathname: "/machinery/maintenance-new", params: { machineId, oneOff: "1" } })}
          testID="service-oneoff-btn"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={styles.historyIcon}><Icon name="tools" size={20} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Log an extra service or repair</Text>
              <Text style={styles.rowMeta}>One-off work — doesn&apos;t set up a recurring schedule</Text>
            </View>
            <Icon name="chevron-right" size={22} color={colors.muted} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { width: "48%", minHeight: 74, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", padding: spacing.sm, gap: 2 },
  presetText: { fontSize: 12, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  presetInterval: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  historyIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
});
