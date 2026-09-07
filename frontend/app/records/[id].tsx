import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { SprayJob } from "@/src/lib/types";

export default function RecordDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<SprayJob | null>(null);

  useFocusEffect(useCallback(() => { if (id) repo.sprayJobs.get(id).then(setJ); }, [id]));

  if (!j) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Spray Record" back /></View>;

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value ?? "—"}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Spray Record" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <Text style={styles.title}>{j.paddock_name ?? "Paddock"}</Text>
          <Text style={styles.sub}>{j.farm_name ?? ""} · {j.date}</Text>
        </Card>

        <Text style={styles.section}>Job</Text>
        <Card>
          <Field label="Crop" value={j.crop} />
          <Field label="Target" value={j.target} />
          <Field label="Operator" value={j.operator} />
          <Field label="Machine" value={j.machinery_name} />
          <Field label="Area treated" value={j.area_ha != null ? `${j.area_ha} ha` : undefined} />
          <Field label="Start / Finish" value={`${j.start_time ?? "—"} → ${j.finish_time ?? "—"}`} />
        </Card>

        <Text style={styles.section}>Application</Text>
        <Card>
          <Field label="Water rate" value={j.water_rate ? `${j.water_rate} L/ha` : undefined} />
          <Field label="Speed" value={j.speed_kmh ? `${j.speed_kmh} km/h` : undefined} />
          <Field label="Boom width" value={j.boom_width_m ? `${j.boom_width_m} m` : undefined} />
          <Field label="Nozzle type" value={j.nozzle_type} />
          <Field label="Pressure" value={j.pressure ? `${j.pressure} bar` : undefined} />
        </Card>

        <Text style={styles.section}>Weather at application</Text>
        <Card>
          <Field label="Temperature" value={j.temperature_c != null ? `${j.temperature_c} °C` : undefined} />
          <Field label="Relative humidity" value={j.humidity != null ? `${j.humidity} %` : undefined} />
          <Field label="Delta T" value={j.delta_t != null ? `${j.delta_t}` : undefined} />
          <Field label="Wind" value={j.wind_speed != null ? `${j.wind_speed} km/h ${j.wind_direction ?? ""}` : undefined} />
        </Card>

        <Text style={styles.section}>Chemicals ({j.products.length})</Text>
        {j.products.length === 0 ? (
          <Card><Text style={styles.empty}>No chemicals recorded.</Text></Card>
        ) : (
          j.products.map((p) => (
            <Card key={p.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.prodName}>{p.chemical_name}</Text>
              <Text style={styles.prodMeta}>Rate: {p.rate} {p.unit}</Text>
              {p.total_qty != null ? <Text style={styles.prodMeta}>Total: {p.total_qty.toFixed(2)} {p.unit.replace("/ha", "")}</Text> : null}
            </Card>
          ))
        )}

        {j.notes ? (
          <>
            <Text style={styles.section}>Notes</Text>
            <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{j.notes}</Text></Card>
          </>
        ) : null}

        <Text style={styles.discl}>
          Check current product label, weather conditions and local spraying requirements before application.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  prodName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  prodMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  discl: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.lg, lineHeight: 18, paddingHorizontal: 20 },
});
