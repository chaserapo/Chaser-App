import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator, Image, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Button, StatusBadge } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { fetchWeather, WeatherSnapshot } from "@/src/lib/weather";
import { repo, maintenanceStatus } from "@/src/lib/storage";
import { useRealtime } from "@/src/lib/realtime";
import { useAuth } from "@/src/lib/auth-context";
import { useOnboarding, profileRepo } from "@/src/lib/onboarding";
import type { SprayJob, Maintenance } from "@/src/lib/types";

const LOGO = require("../../assets/images/chaser-icon.png");

function formatUpdated(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function deriveFirstName(rawName?: string | null, email?: string | null): string | null {
  if (rawName && rawName.trim()) {
    const stripped = rawName.replace(/\s*\(.*?\)\s*$/, "").trim();
    if (stripped) return stripped.split(/\s+/)[0];
  }
  if (email) {
    const local = email.split("@")[0];
    const bit = local.split(/[._-]/)[0];
    if (bit) return bit.charAt(0).toUpperCase() + bit.slice(1).toLowerCase();
  }
  return null;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, business } = useAuth();
  const { percent: onboardingPercent, profile: onboardingProfile, reload: reloadOnboarding, userId: onboardingUserId } = useOnboarding();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [locationLabel, setLocationLabel] = useState("Your location");
  const [jobs, setJobs] = useState<SprayJob[]>([]);
  const [activeJob, setActiveJob] = useState<SprayJob | null>(null);
  const [maints, setMaints] = useState<(Maintenance & { machineName: string; status: "good" | "due_soon" | "overdue"; remaining: number | null })[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [operatorName, setOperatorName] = useState<string | null>(null);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const firstName = deriveFirstName(operatorName, session?.user?.email);

  const loadOperator = useCallback(async () => {
    try {
      const op = await repo.operators.defaultUser();
      setOperatorName(op?.name ?? null);
    } catch {
      setOperatorName(null);
    }
  }, []);

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
    const rank = { overdue: 0, due_soon: 1, good: 2 } as const;
    enriched.sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const ar = a.remaining ?? Infinity;
      const br = b.remaining ?? Infinity;
      return ar - br;
    });
    setDueCount(enriched.filter((x) => x.status !== "good").length);
    setMaints(enriched.slice(0, 2));
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
  useFocusEffect(useCallback(() => { loadData(); loadOperator(); }, [loadData, loadOperator]));
  useRealtime(
    ["machinery", "maintenance_schedules", "maintenance_completions", "spray_jobs", "operators"],
    () => { loadData(); loadOperator(); },
    [loadData, loadOperator],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWeather(), loadData()]);
    setRefreshing(false);
  };

  function openFeedback() {
    const subject = encodeURIComponent("Chaser Beta feedback");
    const body = encodeURIComponent(
      `Hi Chaser team,\n\n` +
      `Feedback / bug / feature request:\n\n\n` +
      `— — — — — — — — — — — — — — —\n` +
      `Business: ${business?.name ?? "—"}\n` +
      `Role: ${business?.role ?? "—"}\n` +
      `Email: ${session?.user?.email ?? "—"}\n` +
      `Platform: ${Platform.OS}\n`
    );
    Linking.openURL(`mailto:chaserapp@outlook.com?subject=${subject}&body=${body}`);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.homeHeader}>
          <Image source={LOGO} style={styles.homeLogo} resizeMode="cover" accessibilityLabel="Chaser" />
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting} testID="greeting-time">
              {greeting}{firstName ? "," : ""}
              {firstName ? <Text style={styles.firstName} testID="greeting-name">{` ${firstName}`}</Text> : null}
            </Text>
            <Text style={styles.prompt}>What are we chasing today?</Text>
          </View>
          <Pressable onPress={openFeedback} style={styles.feedbackBtn} testID="beta-feedback-btn" hitSlop={8}>
            <Icon name="message-alert-outline" size={18} color={colors.brandPrimary} />
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/(tabs)/weather")} style={styles.conditionsStrip} testID="weather-strip">
          <MiniStat label="Temp" value={weather ? `${weather.temperature_c.toFixed(1)}°` : "–"} icon="thermometer" testID="stat-temp" />
          <MiniStat label="RH" value={weather ? `${Math.round(weather.humidity)}%` : "–"} icon="water-percent" testID="stat-humidity" />
          <MiniStat label="ΔT" value={weather ? weather.delta_t.toFixed(1) : "–"} icon="chart-bell-curve-cumulative" testID="stat-delta-t" />
          <MiniStat label="Wind" value={weather ? `${weather.wind_speed.toFixed(0)}` : "–"} unit={weather ? "km/h" : ""} icon="weather-windy" testID="stat-wind-speed" />
          <MiniStat label="Dir" value={weather ? weather.wind_direction : "–"} icon="compass-outline" testID="stat-wind-dir" />
        </Pressable>
        <View style={styles.conditionsMeta}>
          <Pressable onPress={() => router.push("/(tabs)/weather")} style={{ flex: 1 }} hitSlop={4} testID="weather-open-full-btn">
            <Text style={styles.conditionsMetaText} numberOfLines={1} testID="weather-meta">
              {locationLabel} · Updated {weather ? formatUpdated(weather.captured_at) : "—"} · Tap for full forecast
            </Text>
          </Pressable>
          <Pressable onPress={loadWeather} hitSlop={8} testID="refresh-weather-btn" style={{ paddingLeft: 8 }}>
            {loadingWeather ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Icon name="refresh" size={16} color={colors.muted} />}
          </Pressable>
        </View>

        {onboardingProfile && onboardingProfile.onboarding_completed_at && onboardingPercent > 0 && onboardingPercent < 100 ? (
          <Pressable
            onPress={async () => {
              if (!onboardingUserId) return;
              await profileRepo.resume(onboardingUserId);
              await reloadOnboarding();
            }}
            style={styles.setupCard}
            testID="home-setup-card"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle}>Finish setting up Chaser</Text>
              <Text style={styles.setupSub}>You're {onboardingPercent}% of the way there — add the rest whenever you like.</Text>
              <View style={styles.setupBar}><View style={[styles.setupBarFill, { width: `${onboardingPercent}%` }]} /></View>
            </View>
            <Icon name="chevron-right" size={22} color={colors.brandPrimary} />
          </Pressable>
        ) : null}

        <View style={{ height: spacing.lg }} />
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

        <View style={styles.secondaryRow}>
          <Pressable
            onPress={() => router.push("/(tabs)/spray")}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            testID="spray-tools-btn"
          >
            <Icon name="calculator-variant-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.secondaryBtnText}>Spray Tools</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/records/new")}
            style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            testID="new-job-btn"
          >
            <Icon name="plus-circle-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.secondaryBtnText}>New Job</Text>
          </Pressable>
        </View>

        <SectionHeader
          title="Service Reminders"
          rightLabel={dueCount > 0 ? `${dueCount} due` : undefined}
          rightTone={dueCount > 0 ? "warning" : undefined}
          onSeeAll={() => router.push("/(tabs)/machinery")}
          testID="service-reminders-title"
        />
        {maints.length === 0 ? (
          <View style={styles.emptyRow} testID="reminders-empty">
            <View style={styles.checkPill}><Icon name="check" size={16} color={colors.brandPrimary} /></View>
            <Text style={styles.emptyText}>All machines are on top of service.</Text>
          </View>
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
            return (
              <Pressable
                key={m.id}
                onPress={() => router.push({ pathname: "/machinery/[id]", params: { id: m.machinery_id } })}
                style={({ pressed }) => [styles.reminderRow, pressed && styles.rowPressed]}
                testID={`reminder-card-${m.id}`}
              >
                <View style={[styles.reminderAccent, { backgroundColor: accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{m.machineName}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {m.maintenance_type} · <Text style={{ color: accent, fontWeight: "700" }}>{remainingLabel}</Text>
                  </Text>
                </View>
                <StatusBadge status={m.status} testID={`reminder-status-${m.id}`} />
              </Pressable>
            );
          })
        )}

        <SectionHeader title="Recent Spray Records" onSeeAll={() => router.push("/records")} testID="recent-records-title" />
        {jobs.length === 0 ? (
          <View style={styles.emptyRow}>
            <View style={styles.checkPill}><Icon name="clipboard-text-outline" size={16} color={colors.brandPrimary} /></View>
            <Text style={styles.emptyText}>No spray records yet — your completed jobs will show here.</Text>
          </View>
        ) : (
          jobs.map((j) => (
            <Pressable
              key={j.id}
              onPress={() => router.push({ pathname: "/records/[id]", params: { id: j.id } })}
              style={({ pressed }) => [styles.recordRow, pressed && styles.rowPressed]}
              testID={`recent-job-${j.id}`}
            >
              <View style={styles.recordIcon}><Icon name="spray" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{j.paddock_name ?? "Paddock"}{j.crop ? ` · ${j.crop}` : ""}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{j.products.map((p) => p.chemical_name).join(", ") || "—"}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>{j.date} · {j.actual_area_ha ?? j.area_ha ?? 0} ha</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          ))
        )}

        <Text style={styles.footerNote}>Chaser — behind every good operation</Text>
      </ScrollView>
    </View>
  );
}

function MiniStat({ label, value, icon, unit, testID }: { label: string; value: string; icon: string; unit?: string; testID?: string }) {
  return (
    <View style={styles.miniStat} testID={testID}>
      <Icon name={icon as any} size={16} color={colors.brandPrimary} />
      <Text style={styles.miniValue} numberOfLines={1}>{value}{unit ? <Text style={styles.miniUnit}> {unit}</Text> : null}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, rightLabel, rightTone, onSeeAll, testID }: {
  title: string;
  rightLabel?: string;
  rightTone?: "warning";
  onSeeAll?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.sectionHeader} testID={testID}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {rightLabel ? <Text style={[styles.sectionBadge, rightTone === "warning" && styles.sectionBadgeWarn]}>{rightLabel}</Text> : null}
        {onSeeAll ? <Pressable onPress={onSeeAll} hitSlop={8}><Text style={styles.seeAll}>See all</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  homeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  homeLogo: {
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  greetingBlock: { flex: 1, justifyContent: "center" },
  greeting: { color: colors.onSurface, fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  firstName: { color: colors.brandPrimary, fontSize: 22, fontWeight: "800" },
  prompt: { color: colors.muted, fontSize: 14, fontWeight: "500", marginTop: 4 },
  feedbackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSecondary,
  },
  conditionsStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 6,
    marginTop: spacing.xs,
  },
  miniStat: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    gap: 2,
  },
  miniValue: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: 2 },
  miniUnit: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  miniLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  conditionsMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  conditionsMetaText: { color: colors.muted, fontSize: 11, flex: 1 },
  secondaryRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  secondaryBtnPressed: { opacity: 0.7 },
  secondaryBtnText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 14 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  sectionBadge: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  sectionBadgeWarn: { backgroundColor: "#FEF3C7", color: colors.warning },
  seeAll: { color: colors.brandPrimary, fontWeight: "700", fontSize: 13 },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: spacing.md,
    paddingRight: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  reminderAccent: { width: 4, height: 36, borderRadius: 2 },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  recordIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSecondary,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  rowSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  rowMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: spacing.md,
  },
  checkPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: colors.muted, fontSize: 13, flex: 1 },
  footerNote: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: spacing.xl,
  },
  setupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandSecondary,
    borderWidth: 1,
    borderColor: colors.brandPrimary,
  },
  setupTitle: { color: colors.brandPrimary, fontSize: 14, fontWeight: "800" },
  setupSub: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  setupBar: { height: 4, backgroundColor: colors.surface, borderRadius: 999, marginTop: 8, overflow: "hidden" },
  setupBarFill: { height: 4, backgroundColor: colors.brandPrimary, borderRadius: 999 },
});