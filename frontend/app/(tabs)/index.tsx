import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, SectionTitle, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { fetchWeather, WeatherSnapshot } from "@/src/lib/weather";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import type { SprayJob, Maintenance } from "@/src/lib/types";

function formatUpdated(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [locationLabel, setLocationLabel] = useState("Your location");
  const [jobs, setJobs] = useState<SprayJob[]>([]);
  const [activeJob, setActiveJob] = useState<SprayJob | null>(null);
  const [maints, setMaints] = useState<(Maintenance & { machineName: string; status: "good" | "due_soon" | "overdue"; remaining: number | null })[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [j, ms, m, active] = await Promise.all([
      repo.sprayJobs.completed(),
      repo.maintenance.list(),
      repo.machinery.list(),
      repo.sprayJobs.active(),
    ]);
    setJobs(j.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3));
    setActiveJob(active);
    const enriched = ms
      .filter((mn) => mn.next_service_hours != null)
      .map((mn) => {
        const mach = m.find((x) => x.id === mn.machinery_id);
        const remaining = mach?.current_hours != null && mn.next_service_hours != null
          ? mn.next_service_hours - mach.current_hours
          : null;
        return {
          ...mn,
          machineName: mach?.name ?? "Machine",
          status: maintenanceStatus(mach?.current_hours, mn.next_service_hours),
          remaining,
        };
      });
    // Prioritise not-good (overdue first, then due_soon), then good, sorted by remaining ascending
    const rank = { overdue: 0, due_soon: 1, good: 2 } as const;
    enriched.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const ar = a.remaining ?? Infinity;
      const br = b.remaining ?? Infinity;
      return ar - br;
    });
    setDueCount(enriched.filter((x) => x.status !== "good").length);
    setMaints(enriched.slice(0, 3));
  }, []);

  const loadWeather = useCallback(async () => {
    setLoadingWeather(true);
    try {
      const w = await fetchWeather();
      setWeather(w);
      if (w.lat && w.lon) setLocationLabel(`Your location · ${w.lat.toFixed(2)}, ${w.lon.toFixed(2)}`);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => { loadWeather(); }, [loadWeather]);
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWeather(), loadData()]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Good day</Text>
          <Text style={styles.title}>HectareHQ</Text>
        </View>
        <Pressable onPress={loadWeather} style={styles.refreshBtn} testID="refresh-weather-btn">
          <Icon name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <Card style={styles.weatherCard} testID="weather-card">
          <View style={styles.weatherHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
              <Icon name="weather-partly-cloudy" size={20} color={colors.brandPrimary} />
              <Text style={styles.weatherTitle}>Current Conditions</Text>
            </View>
            {loadingWeather ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : null}
          </View>

          <View style={styles.statGrid}>
            <Stat label="Temp" value={weather ? `${weather.temperature_c.toFixed(1)}°C` : "--"} icon="thermometer" testID="stat-temp" />
            <Stat label="Humidity" value={weather ? `${Math.round(weather.humidity)}%` : "--"} icon="water-percent" testID="stat-humidity" />
            <Stat label="Delta T" value={weather ? `${weather.delta_t.toFixed(1)}` : "--"} icon="chart-bell-curve-cumulative" testID="stat-delta-t" />
            <Stat label="Wind" value={weather ? `${weather.wind_speed.toFixed(0)} km/h` : "--"} icon="weather-windy" testID="stat-wind-speed" />
            <Stat label="Direction" value={weather ? weather.wind_direction : "--"} icon="compass-outline" testID="stat-wind-dir" />
          </View>

          <View style={styles.weatherMeta}>
            <Icon name="map-marker-outline" size={14} color={colors.muted} />
            <Text style={styles.weatherMetaText} testID="weather-meta">
              {locationLabel} · Updated {weather ? formatUpdated(weather.captured_at) : "—"}
            </Text>
          </View>

          <Text style={styles.disclaimer}>
            Check current product label, weather conditions and local spraying requirements before application.
          </Text>
        </Card>

        <View style={{ height: spacing.md }} />
        {activeJob ? (
          <Button
            title="Resume Active Spray Job"
            icon="play-circle"
            size="lg"
            onPress={() => router.push({ pathname: "/active-job/[id]", params: { id: activeJob.id } })}
            testID="resume-active-job-btn"
          />
        ) : (
          <Button
            title="Start Spray Job"
            icon="play-circle-outline"
            size="lg"
            onPress={() => router.push("/records/new")}
            testID="start-spray-job-btn"
          />
        )}
        <View style={{ height: spacing.md }} />
        <Button title="Spray Calculator" icon="calculator-variant-outline" size="lg" variant="secondary" onPress={() => router.push("/(tabs)/spray")} testID="spray-calculator-btn" />

        <SectionTitle
          testID="service-reminders-title"
          action={<Pressable onPress={() => router.push("/(tabs)/machinery")} hitSlop={8}><Text style={styles.linkText}>See all</Text></Pressable>}
        >
          Service Reminders
        </SectionTitle>
        {dueCount > 0 ? (
          <View style={styles.dueBanner} testID="due-banner">
            <Icon name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.dueBannerText}>{dueCount} service{dueCount === 1 ? "" : "s"} due or overdue across your fleet</Text>
          </View>
        ) : null}
        {maints.length === 0 ? (
          <Card testID="reminders-empty">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={styles.checkPill}><Icon name="check" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>You&apos;re on top of service</Text>
                <Text style={styles.itemSub}>Add a maintenance schedule on any machine to see reminders here.</Text>
              </View>
            </View>
          </Card>
        ) : (
          maints.map((m) => {
            const isOverdue = m.status === "overdue";
            const isDue = m.status === "due_soon";
            const remainingLabel = m.remaining == null
              ? `Next @ ${m.next_service_hours}h`
              : isOverdue
                ? `${Math.abs(Math.round(m.remaining))}h overdue`
                : `${Math.round(m.remaining)}h remaining`;
            const accent = isOverdue ? colors.error : isDue ? colors.warning : colors.brandPrimary;
            const accentBg = isOverdue ? "#FEE2E2" : isDue ? "#FEF3C7" : colors.brandSecondary;
            return (
              <Card
                key={m.id}
                style={{ marginBottom: spacing.sm, borderLeftWidth: 4, borderLeftColor: accent }}
                testID={`reminder-card-${m.id}`}
                onPress={() => router.push({ pathname: "/machinery/[id]", params: { id: m.machinery_id } })}
              >
                <View style={styles.rowBetween}>
                  <View style={[styles.reminderIcon, { backgroundColor: accentBg }]}>
                    <Icon name={isOverdue ? "alert-octagon" : isDue ? "clock-alert-outline" : "wrench-outline"} size={20} color={accent} />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{m.machineName}</Text>
                    <Text style={styles.itemSub} numberOfLines={1}>{m.maintenance_type}</Text>
                    <Text style={[styles.itemMeta, (isOverdue || isDue) && { color: accent, fontWeight: "700" }]}>
                      {remainingLabel}{m.next_service_hours != null ? ` · @ ${m.next_service_hours}h` : ""}
                    </Text>
                  </View>
                  <StatusBadge status={m.status} testID={`reminder-status-${m.id}`} />
                </View>
              </Card>
            );
          })
        )}

        <SectionTitle
          testID="recent-records-title"
          action={<Pressable onPress={() => router.push("/records")}><Text style={styles.linkText}>See all</Text></Pressable>}
        >
          Recent Spray Records
        </SectionTitle>
        {jobs.length === 0 ? (
          <Card><Text style={styles.empty}>No spray records yet.</Text></Card>
        ) : (
          jobs.map((j) => (
            <Card key={j.id} style={{ marginBottom: spacing.sm }} testID={`recent-job-${j.id}`}
              onPress={() => router.push({ pathname: "/records/[id]", params: { id: j.id } })}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.itemTitle}>{j.paddock_name ?? "Paddock"} · {j.crop ?? ""}</Text>
                  <Text style={styles.itemSub}>{j.products.map((p) => p.chemical_name).join(", ") || "—"}</Text>
                  <Text style={styles.itemMeta}>{j.date} · {j.actual_area_ha ?? j.area_ha ?? 0} ha</Text>
                </View>
                <Icon name="chevron-right" size={22} color={colors.muted} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, icon, testID }: { label: string; value: string; icon: string; testID?: string }) {
  return (
    <View style={styles.statBox} testID={testID}>
      <Icon name={icon as any} size={18} color={colors.brandPrimary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  greeting: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  title: { color: colors.onSurface, fontSize: 26, fontWeight: "800", marginTop: 2 },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  weatherCard: { padding: spacing.lg },
  weatherHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  weatherTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurfaceSecondary },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statBox: { flexGrow: 1, minWidth: "30%", backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  statLabel: { fontSize: 11, fontWeight: "600", color: colors.muted, marginTop: 2, textTransform: "uppercase" },
  weatherMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.md },
  weatherMetaText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  disclaimer: { marginTop: spacing.sm, fontSize: 12, color: colors.muted, lineHeight: 17 },
  linkText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  itemSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: 12 },
  dueBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, marginBottom: spacing.sm },
  dueBannerText: { color: colors.warning, fontWeight: "700", fontSize: 13, flex: 1 },
  reminderIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginRight: 12 },
  checkPill: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
});
