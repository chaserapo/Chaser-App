import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import type { Machinery, Maintenance } from "@/src/lib/types";

export default function MachineDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [m, setM] = useState<Machinery | null>(null);
  const [maints, setMaints] = useState<Maintenance[]>([]);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    (async () => {
      const [mach, mm] = await Promise.all([repo.machinery.get(id), repo.maintenance.forMachine(id)]);
      setM(mach);
      setMaints(mm.sort((a, b) => (b.next_service_hours ?? 0) - (a.next_service_hours ?? 0)));
    })();
  }, [id]));

  if (!m) {
    return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Machine" back /></View>;
  }

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ?? "—"}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title={m.name} back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}>
            <View style={styles.iconBox}><Icon name="tractor-variant" size={30} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.sub}>{m.make ?? ""} {m.model ?? ""}</Text>
            </View>
          </View>
          <Field label="Year" value={m.year} />
          <Field label="Serial number" value={m.serial_number} />
          <Field label="Registration" value={m.registration} />
          <Field label="Current hours" value={m.current_hours != null ? `${m.current_hours} h` : undefined} />
          <Field label="Purchase date" value={m.purchase_date} />
        </Card>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Maintenance</Text>
          <Pressable onPress={() => router.push({ pathname: "/machinery/maintenance-new", params: { machineId: m.id } })} testID="add-maint-btn">
            <Text style={styles.link}>+ Add</Text>
          </Pressable>
        </View>

        {maints.length === 0 ? (
          <Card><Text style={styles.empty}>No maintenance records.</Text></Card>
        ) : (
          maints.map((mn) => {
            const status = maintenanceStatus(m.current_hours, mn.next_service_hours);
            return (
              <Card key={mn.id} style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mnTitle}>{mn.maintenance_type}</Text>
                    <Text style={styles.mnMeta}>
                      Last: {mn.last_service_hours ?? "—"}h · Next: {mn.next_service_hours ?? "—"}h
                    </Text>
                    {mn.last_service_date ? <Text style={styles.mnDate}>{mn.last_service_date.slice(0, 10)}</Text> : null}
                    {mn.cost != null ? <Text style={styles.mnDate}>Cost: ${mn.cost}</Text> : null}
                    {mn.parts_used ? <Text style={styles.mnDate}>Parts: {mn.parts_used}</Text> : null}
                  </View>
                  <StatusBadge status={status} />
                </View>
              </Card>
            );
          })
        )}

        {m.notes ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg, marginBottom: spacing.sm }]}>Notes</Text>
            <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{m.notes}</Text></Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  name: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  mnTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  mnMeta: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  mnDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
});
