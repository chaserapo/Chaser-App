import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, Card, SectionTitle, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { fetchWeather, WeatherSnapshot } from "@/src/lib/weather";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import type { SprayJob, Maintenance, Machinery } from "@/src/lib/types";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [jobs, setJobs] = useState<SprayJob[]>([]);
  const [maints, setMaints] = useState<(Maintenance & { machineName: string; status: "good" | "due_soon" | "overdue" })[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [j, ms, m] = await Promise.all([repo.sprayJobs.list(), repo.maintenance.list(), repo.machinery.list()]);
    setJobs(j.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 3));
    const withStatus = ms
      .map((mn) => {
        const mach = m.find((x) => x.id === mn.machinery_id);
        return {
          ...mn,
          machineName: mach?.name ?? "Machine",
          status: maintenanceStatus(mach?.current_hours, mn.next_service_hours),
        };
      })
      .sort((a, b) => (a.status === "overdue" ? -1 : b.status === "overdue" ? 1 : a.status === "due_soon" ? -1 : 1))
      .slice(0, 3);
    setMaints(withStatus);
  }, []);

  const loadWeather = useCallback(async () => {
    setLoadingWeather(true);
    try {
      const w = await fetchWeather();
      setWeather(w);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

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
          <Text style={styles.title}>AgSpray Pro</Text>
        </View>
        <Pressable onPress={loadWeather} style={styles.refreshBtn} testID="refresh-weather-btn">
          <Icon name="refresh" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        {/* Weather Card */}
        <Card style={styles.weatherCard} testID="weather-card">
          <View style={styles.weatherHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
          <Text style={styles.disclaimer}>
            Check current product label, weather conditions and local spraying requirements before application.
          </Text>
        </Card>

        <View style={{ height: spacing.md }} />
        <Button title="Start Spray Job" icon="play-circle-outline" size="lg" onPress={() => router.push("/records/new")} testID="start-spray-job-btn" />
        <View style={{ height: spacing.md }} />
        <Button title="Spray Calculator" icon="calculator-variant-outline" size="lg" variant="secondary" onPress={() => router.push("/(tabs)/spray")} testID="spray-calculator-btn" />

        <SectionTitle
          testID="upcoming-maintenance-title"
          action={<Pressable onPress={() => router.push("/(tabs)/machinery")}><Text style={styles.linkText}>See all</Text></Pressable>}
        >
          Upcoming Maintenance
        </SectionTitle>
        {maints.length === 0 ? (
          <Card><Text style={styles.empty}>No maintenance recorded.</Text></Card>
        ) : (
          maints.map((m) => (
            <Card key={m.id} style={{ marginBottom: spacing.sm }} testID={`maint-card-${m.id}`}
              onPress={() => router.push({ pathname: "/machinery/[id]", params: { id: m.machinery_id } })}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.itemTitle}>{m.machineName}</Text>
                  <Text style={styles.itemSub}>{m.maintenance_type}</Text>
                  {m.next_service_hours ? <Text style={styles.itemMeta}>Next @ {m.next_service_hours}h</Text> : null}
                </View>
                <StatusBadge status={m.status} />
              </View>
            </Card>
          ))
        )}

        <SectionTitle
          testID="recent-records-title"
          action={<Pressable onPress={() => router.push("/(tabs)/records")}><Text style={styles.linkText}>See all</Text></Pressable>}
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
                  <Text style={styles.itemMeta}>{j.date} · {j.area_ha ?? 0} ha</Text>
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
  disclaimer: { marginTop: spacing.md, fontSize: 12, color: colors.muted, lineHeight: 17 },
  linkText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  itemSub: { fontSize: 13, color: colors.onSurfaceTertiary, marginTop: 2 },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: 12 },
});
