import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Button, Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import type { SprayJob } from "@/src/lib/types";

function buildSignOffPayload(j: SprayJob) {
  return {
    v: 1,
    kind: "hectarehq_spray_signoff",
    id: j.id,
    date: j.date,
    farm: j.farm_name,
    paddock: j.paddock_name,
    crop: j.crop,
    target: j.target,
    operator: j.operator,
    machine: j.machinery_name,
    area_ha: j.actual_area_ha ?? j.area_ha,
    water_rate_lha: j.water_rate,
    speed_kmh: j.speed_kmh,
    nozzle: j.nozzle_type,
    start_time: j.start_time,
    finish_time: j.finish_time,
    start_weather: {
      t: j.temperature_c, rh: j.humidity, delta_t: j.delta_t,
      wind: j.wind_speed, dir: j.wind_direction, at: j.weather_captured_at,
    },
    finish_weather: {
      t: j.finish_temperature_c, rh: j.finish_humidity, delta_t: j.finish_delta_t,
      wind: j.finish_wind_speed, dir: j.finish_wind_direction, at: j.finish_weather_captured_at,
    },
    gps: j.gps_lat ? { lat: j.gps_lat, lon: j.gps_lon } : undefined,
    products: j.products.map((p) => ({ name: p.chemical_name, rate: p.rate, unit: p.unit, total: p.total_qty })),
    notes: j.notes,
    finish_notes: j.finish_notes,
  };
}

export default function RecordDetail() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [j, setJ] = useState<SprayJob | null>(null);
  const [showQR, setShowQR] = useState(false);

  useFocusEffect(useCallback(() => { if (id) repo.sprayJobs.get(id as string).then(setJ); }, [id]));

  if (!j) return <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}><ScreenHeader title="Spray Record" back /></View>;

  const payload = buildSignOffPayload(j);
  const payloadStr = JSON.stringify(payload);
  const isCompleted = j.status === "completed";

  async function shareRecord() {
    const summary = `HectareHQ Spray Record\n${j!.date} · ${j!.farm_name ?? ""} · ${j!.paddock_name ?? ""}\nCrop: ${j!.crop ?? "—"} · Target: ${j!.target ?? "—"}\nArea: ${j!.actual_area_ha ?? j!.area_ha ?? "—"} ha\nOperator: ${j!.operator ?? "—"}\nMachine: ${j!.machinery_name ?? "—"}\nProducts:\n${j!.products.map((p) => `  · ${p.chemical_name} ${p.rate} ${p.unit}${p.total_qty ? ` (total ${p.total_qty.toFixed(2)})` : ""}`).join("\n")}\nWeather: ${j!.temperature_c ?? "—"}°C, RH ${j!.humidity ?? "—"}%, Delta T ${j!.delta_t ?? "—"}, Wind ${j!.wind_speed ?? "—"} km/h ${j!.wind_direction ?? ""}`;
    try { await Share.share({ message: summary }); } catch {}
  }

  const Field = ({ label, value }: { label: string; value?: string | number }) => (
    <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value ?? "—"}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Spray Record" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.title}>{j.paddock_name ?? "Paddock"}</Text>
            {isCompleted ? <View style={styles.doneBadge}><Icon name="check-circle" size={14} color={colors.onSuccess} /><Text style={styles.doneBadgeText}>Completed</Text></View> : null}
          </View>
          <Text style={styles.sub}>{j.farm_name ?? ""} · {j.date}</Text>
        </Card>

        {isCompleted && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Sign-Off QR</Text>
              <Pressable onPress={() => setShowQR((v) => !v)} testID="toggle-qr-btn">
                <Text style={styles.link}>{showQR ? "Hide" : "Show"}</Text>
              </Pressable>
            </View>
            {showQR ? (
              <Card style={{ alignItems: "center", paddingVertical: spacing.xl }} testID="qr-card">
                <View style={styles.qrWrap}>
                  <QRCode value={payloadStr} size={220} backgroundColor={colors.surfaceSecondary} color={colors.onSurface} />
                </View>
                <Text style={styles.qrCaption}>Scan to verify this spray job at the paddock gate.</Text>
                <Text style={styles.qrId}>Record ID: {j.id.slice(0, 8)}</Text>
                <View style={{ height: spacing.md, alignSelf: "stretch" }} />
                <Button title="Share Record" icon="share-variant-outline" variant="outline" onPress={shareRecord} testID="share-record-btn" />
              </Card>
            ) : (
              <Card onPress={() => setShowQR(true)} testID="qr-preview-card">
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={styles.qrIconBox}><Icon name="qrcode-scan" size={26} color={colors.brandPrimary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.qrPreviewTitle}>Show QR code for verification</Text>
                    <Text style={styles.qrPreviewSub}>Agronomists & auditors can scan to check the tank mix, weather, area & operator.</Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={colors.muted} />
                </View>
              </Card>
            )}
          </>
        )}

        <Text style={styles.section}>Job</Text>
        <Card>
          <Field label="Crop" value={j.crop} />
          <Field label="Target" value={j.target} />
          <Field label="Operator" value={j.operator} />
          <Field label="Machine" value={j.machinery_name} />
          <Field label="Area planned" value={j.area_ha != null ? `${j.area_ha} ha` : undefined} />
          {j.actual_area_ha != null ? <Field label="Actual area treated" value={`${j.actual_area_ha} ha`} /> : null}
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

        <Text style={styles.section}>Starting weather</Text>
        <Card>
          <Field label="Temperature" value={j.temperature_c != null ? `${j.temperature_c} °C` : undefined} />
          <Field label="Relative humidity" value={j.humidity != null ? `${j.humidity} %` : undefined} />
          <Field label="Delta T" value={j.delta_t != null ? `${j.delta_t}` : undefined} />
          <Field label="Wind" value={j.wind_speed != null ? `${j.wind_speed} km/h ${j.wind_direction ?? ""}` : undefined} />
        </Card>

        {j.finish_temperature_c != null || j.finish_wind_speed != null ? (
          <>
            <Text style={styles.section}>Finish weather</Text>
            <Card>
              <Field label="Temperature" value={j.finish_temperature_c != null ? `${j.finish_temperature_c} °C` : undefined} />
              <Field label="Relative humidity" value={j.finish_humidity != null ? `${j.finish_humidity} %` : undefined} />
              <Field label="Delta T" value={j.finish_delta_t != null ? `${j.finish_delta_t}` : undefined} />
              <Field label="Wind" value={j.finish_wind_speed != null ? `${j.finish_wind_speed} km/h ${j.finish_wind_direction ?? ""}` : undefined} />
            </Card>
          </>
        ) : null}

        <Text style={styles.section}>Chemicals ({j.products.length})</Text>
        {j.products.length === 0 ? (
          <Card><Text style={styles.empty}>No chemicals recorded.</Text></Card>
        ) : (
          j.products.map((p) => (
            <Card key={p.id} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.prodName}>{p.chemical_name}</Text>
              <Text style={styles.prodMeta}>Rate: {p.rate} {p.unit}</Text>
              {p.total_qty != null ? <Text style={styles.prodMeta}>Total: {p.total_qty.toFixed(2)} {p.total_qty_unit ?? (p.unit === "%v/v" ? "L water" : p.unit.replace("/ha", ""))}</Text> : null}
            </Card>
          ))
        )}

        {j.notes ? (
          <>
            <Text style={styles.section}>Notes</Text>
            <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{j.notes}</Text></Card>
          </>
        ) : null}

        {j.finish_notes ? (
          <>
            <Text style={styles.section}>Final notes</Text>
            <Card><Text style={{ color: colors.onSurface, lineHeight: 20 }}>{j.finish_notes}</Text></Card>
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
  title: { fontSize: 20, fontWeight: "800", color: colors.onSurface, flexShrink: 1 },
  sub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  doneBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  doneBadgeText: { color: colors.onSuccess, fontWeight: "800", fontSize: 11 },
  section: { fontSize: 13, fontWeight: "800", color: colors.muted, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.sm },
  link: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  field: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { fontSize: 12, color: colors.muted, fontWeight: "600", textTransform: "uppercase" },
  fieldValue: { fontSize: 15, color: colors.onSurface, marginTop: 4, fontWeight: "600" },
  prodName: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  prodMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center" },
  discl: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: spacing.lg, lineHeight: 18, paddingHorizontal: 20 },
  qrWrap: { padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  qrCaption: { fontSize: 13, color: colors.onSurface, marginTop: spacing.md, textAlign: "center", fontWeight: "600" },
  qrId: { fontSize: 11, color: colors.muted, marginTop: 4, fontFamily: "monospace" },
  qrIconBox: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginRight: 14 },
  qrPreviewTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  qrPreviewSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
