import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";

import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import { computeFarmAccuracy, variableLabel, MODEL_META, type FarmAccuracyReport, type AccuracyVariable, type ModelId } from "@/src/lib/weather-intel";
import type { Farm } from "@/src/lib/types";

const VARS: AccuracyVariable[] = ["temperature_c", "precip_mm", "wind_speed_kmh", "humidity_pct"];

export default function AccuracyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [reports, setReports] = useState<Record<string, FarmAccuracyReport>>({});
  const [busyFarm, setBusyFarm] = useState<string | null>(null);
  const [openFarm, setOpenFarm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const fs = await repo.farms.active();
    setFarms(fs);
    if (fs.length > 0 && !openFarm) setOpenFarm(fs[0].id);
  }, [openFarm]);
  useEffect(() => { load(); }, [load]);

  async function refresh(farm: Farm) {
    setBusyFarm(farm.id);
    try {
      const r = await computeFarmAccuracy(farm.id, farm.name, 14);
      if (r) setReports((s) => ({ ...s, [farm.id]: r }));
    } finally {
      setBusyFarm(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <ScreenHeader title="Model Accuracy" back />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}>
        <Text style={styles.blurb}>
          Chaser stores every forecast it fetches so we can score how each model actually performed at your place. Numbers are mean absolute error (MAE) against ERA5 observations from the past 14 days.
        </Text>

        {farms.length === 0 ? (
          <Card>
            <Text style={styles.emptyTitle}>No farms yet</Text>
            <Text style={styles.emptyBody}>Add a farm and a paddock boundary so Chaser can start building your forecast history.</Text>
          </Card>
        ) : null}

        {farms.map((farm) => {
          const report = reports[farm.id];
          const open = openFarm === farm.id;
          return (
            <View key={farm.id} style={{ marginBottom: spacing.md }}>
              <Pressable onPress={() => setOpenFarm(open ? null : farm.id)} style={styles.farmHeader} testID={`accuracy-farm-${farm.id}`}>
                <Icon name={open ? "chevron-down" : "chevron-right"} size={22} color={colors.muted} />
                <Icon name="barn" size={20} color={colors.brandPrimary} style={{ marginRight: 6 }} />
                <Text style={styles.farmName}>{farm.name}</Text>
                {report ? <Text style={styles.farmMeta}>{report.hoursScored} hrs scored</Text> : null}
              </Pressable>

              {open ? (
                <Card>
                  <Pressable
                    onPress={() => refresh(farm)}
                    style={styles.refreshBtn}
                    disabled={busyFarm === farm.id}
                    testID={`accuracy-refresh-${farm.id}`}
                  >
                    {busyFarm === farm.id ? (
                      <ActivityIndicator color={colors.brandPrimary} />
                    ) : (
                      <>
                        <Icon name="refresh" size={16} color={colors.brandPrimary} />
                        <Text style={styles.refreshBtnText}>{report ? "Refresh scorecard" : "Compute scorecard"}</Text>
                      </>
                    )}
                  </Pressable>

                  {!report ? (
                    <Text style={styles.hint}>Tap Compute to run the calculation. It takes 10–20 seconds and needs at least one day of forecast history.</Text>
                  ) : report.hoursScored === 0 ? (
                    <View style={styles.warnBox}>
                      <Icon name="clock-outline" size={16} color={colors.warning} />
                      <Text style={styles.warnText}>
                        Not enough history yet. Chaser needs a few days of forecast runs stored before there's anything to score. Check back after your first week.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.sectionH}>Best model per variable</Text>
                      <View style={styles.bestRow}>
                        {VARS.map((v) => {
                          const best = report.bestByVariable[v];
                          return (
                            <View key={v} style={styles.bestCell}>
                              <Text style={styles.bestCellLabel}>{variableLabel(v).split(" (")[0]}</Text>
                              <Text style={styles.bestCellValue}>{best ? MODEL_META[best].short : "—"}</Text>
                            </View>
                          );
                        })}
                      </View>

                      <Text style={styles.sectionH}>Full scorecard (lower MAE = closer)</Text>
                      <View style={styles.tableWrap}>
                        <View style={styles.tableHead}>
                          <Text style={[styles.th, { flex: 1.6 }]}>Model</Text>
                          {VARS.map((v) => (
                            <Text key={v} style={[styles.th, { flex: 1, textAlign: "right" }]}>{variableLabel(v).split(" (")[0]}</Text>
                          ))}
                        </View>
                        {(["ecmwf_ifs025", "ecmwf_aifs025", "bom_access_global", "gfs_seamless"] as ModelId[]).map((m) => (
                          <View key={m} style={styles.tableRow}>
                            <Text style={[styles.tdBold, { flex: 1.6 }]} numberOfLines={1}>{MODEL_META[m].short}</Text>
                            {VARS.map((v) => {
                              const r = report.perModel.find((x) => x.model === m && x.variable === v);
                              const mae = r?.mae;
                              const isBest = report.bestByVariable[v] === m;
                              return (
                                <Text
                                  key={v}
                                  style={[styles.td, { flex: 1, textAlign: "right", color: isBest ? colors.brandPrimary : colors.onSurface, fontWeight: isBest ? "800" : "600" }]}
                                >
                                  {typeof mae === "number" ? mae.toFixed(mae < 1 ? 2 : 1) : "—"}
                                </Text>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                      <Text style={styles.footer}>
                        Sample: {report.hoursScored} hours over the last {report.sinceDays} days · Computed {new Date(report.computedAt).toLocaleTimeString()}
                      </Text>
                    </>
                  )}
                </Card>
              ) : null}
            </View>
          );
        })}

        <Text style={styles.smallprint}>
          MAE = mean absolute error. A model with MAE 1.2 on temperature means its forecasts have been 1.2 °C off on average at this location. Errors are computed against ERA5 reanalysis (public archive, ~5 day publication lag). Use this as a guide — not as a ranking, and never as a reason to skip label / label-required checks.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  blurb: { fontSize: 13, color: colors.onSurface, lineHeight: 19, marginBottom: spacing.md },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  emptyBody: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  farmHeader: { flexDirection: "row", alignItems: "center", padding: spacing.sm, backgroundColor: colors.brandSecondary, borderRadius: radius.sm, gap: 4 },
  farmName: { fontSize: 15, fontWeight: "800", color: colors.onSurface, flex: 1 },
  farmMeta: { fontSize: 11, color: colors.muted, fontWeight: "600" },
  refreshBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 10, marginBottom: spacing.md },
  refreshBtnText: { color: colors.brandPrimary, fontSize: 13, fontWeight: "800" },
  hint: { fontSize: 12, color: colors.muted, fontStyle: "italic", textAlign: "center" },
  warnBox: { flexDirection: "row", gap: 8, backgroundColor: "#FFFBEB", borderColor: colors.warning, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm },
  warnText: { flex: 1, fontSize: 12, color: colors.warning, fontWeight: "600", lineHeight: 17 },
  sectionH: { fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "800", marginTop: spacing.sm, marginBottom: spacing.xs },
  bestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: spacing.sm },
  bestCell: { flexGrow: 1, minWidth: "45%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10 },
  bestCellLabel: { fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "700" },
  bestCellValue: { fontSize: 14, color: colors.brandPrimary, fontWeight: "800", marginTop: 2 },
  tableWrap: { marginBottom: spacing.sm },
  tableHead: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: "800" },
  tableRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: "center" },
  tdBold: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
  td: { fontSize: 12 },
  footer: { fontSize: 10, color: colors.muted, marginTop: spacing.sm, textAlign: "center", fontStyle: "italic" },
  smallprint: { fontSize: 10, color: colors.muted, marginTop: spacing.lg, lineHeight: 14, fontStyle: "italic" },
});
