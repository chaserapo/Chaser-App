import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { ScreenHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { colors, radius, spacing } from "@/src/theme";
import { repo } from "@/src/lib/storage";
import {
  runForecast,
  upsertLocationForFarm,
  findSeedingWindows,
  frostRiskNext48,
  rainRiskNext24,
  confidenceLabel,
  DEFAULT_SEEDING_THRESHOLDS,
  type ForecastBundle,
} from "@/src/lib/weather-intel";
import type { Farm, Paddock, PaddockBoundary } from "@/src/lib/types";

const STALE_MS = 45 * 60 * 1000;

type TargetKind = "farm" | "paddock";
type Target = { kind: TargetKind; id: string; label: string; lat: number; lon: number; farm_id: string };

function polygonCentroid(b?: PaddockBoundary | null): { lat: number; lon: number } | null {
  if (!b || b.type !== "Polygon" || !b.coordinates || b.coordinates.length === 0) return null;
  const ring = b.coordinates[0];
  if (!ring || ring.length === 0) return null;
  let sx = 0, sy = 0, n = 0;
  for (const [lng, lat] of ring) {
    if (typeof lng === "number" && typeof lat === "number") { sx += lng; sy += lat; n += 1; }
  }
  if (n === 0) return null;
  return { lat: sy / n, lon: sx / n };
}

function coordsForPaddock(p: Paddock): { lat: number; lon: number } | null {
  return polygonCentroid(p.boundary ?? null);
}

function coordsForFarm(farm: Farm, paddocks: Paddock[]): { lat: number; lon: number } | null {
  const own = paddocks.filter((p) => p.farm_id === farm.id).map(coordsForPaddock).filter((c): c is { lat: number; lon: number } => !!c);
  if (own.length === 0) return null;
  const lat = own.reduce((s, c) => s + c.lat, 0) / own.length;
  const lon = own.reduce((s, c) => s + c.lon, 0) / own.length;
  return { lat, lon };
}

export default function SowingWindowScreen() {
  const insets = useSafeAreaInsets();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [bundle, setBundle] = useState<ForecastBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchedForTargetId, setFetchedForTargetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fs, ps] = await Promise.all([repo.farms.active(), repo.paddocks.active()]);
    setFarms(fs);
    setPaddocks(ps);
    if (!target && fs.length > 0) {
      for (const f of fs) {
        const c = coordsForFarm(f, ps);
        if (c) { setTarget({ kind: "farm", id: f.id, label: f.name, lat: c.lat, lon: c.lon, farm_id: f.id }); break; }
      }
    }
  }, [target]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const runFetch = useCallback(async (opts?: { silent?: boolean }) => {
    if (!target) return;
    if (!opts?.silent) setLoading(true);
    try {
      const loc = await upsertLocationForFarm(target.farm_id, target.lat, target.lon, target.label);
      const b = await runForecast({ locationId: loc?.id ?? null, lat: target.lat, lon: target.lon, source: "client" });
      setBundle(b);
      setFetchedForTargetId(target.id);
    } catch (e) {
      console.warn("sowing window fetch failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const stale = !bundle || Date.now() - new Date(bundle.retrieved_at).getTime() > STALE_MS || fetchedForTargetId !== target.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- runFetch is also called directly by the manual-refresh handler.
    if (stale) runFetch();
  }, [target, bundle, fetchedForTargetId, runFetch]);

  const daily = useMemo(() => bundle?.daily ?? [], [bundle]);
  const consensus = useMemo(() => bundle?.consensus ?? [], [bundle]);
  let currentIndex = 0;
  for (let i = 0; i < consensus.length; i++) {
    // eslint-disable-next-line react-hooks/purity -- reading "now" to find which forecast hour is current is the whole point here.
    if (new Date(consensus[i].valid_time).getTime() <= Date.now()) currentIndex = i;
    else break;
  }
  const nextHours = useMemo(() => consensus.slice(currentIndex, currentIndex + 24), [consensus, currentIndex]);
  const currentHour = consensus[currentIndex];
  const seedingWindows = useMemo(() => findSeedingWindows(consensus, DEFAULT_SEEDING_THRESHOLDS), [consensus]);
  const frost = useMemo(() => frostRiskNext48(consensus), [consensus]);
  const rain = useMemo(() => rainRiskNext24(daily), [daily]);
  const hasSoilData = nextHours.some((h) => h.soil_temp_c != null);

  if (farms.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Sowing Window" back />
        <View style={styles.emptyWrap}>
          <Icon name="weather-partly-cloudy" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>No farms yet</Text>
          <Text style={styles.emptyBody}>Add a farm with at least one mapped paddock so Chaser can pull a forecast for it.</Text>
        </View>
      </View>
    );
  }
  if (!target) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ScreenHeader title="Sowing Window" back />
        <View style={styles.emptyWrap}>
          <Icon name="crosshairs-gps" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>Location required</Text>
          <Text style={styles.emptyBody}>None of your farms have paddock boundaries yet — draw at least one on the Paddocks tab first.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Sowing Window" back />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); runFetch(); }} tintColor={colors.brandPrimary} />}
      >
        <LocationSelector farms={farms} paddocks={paddocks} target={target} onChange={setTarget} />

        {loading && !bundle ? (
          <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.loadingText}>Fetching six independent models…</Text></View>
        ) : currentHour ? (
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View>
                <Text style={styles.heroLabel}>Chaser Consensus Forecast</Text>
                <Text style={styles.heroSub}>Averaged from {bundle?.models_returned.length ?? 0} models · {formatTime(bundle?.retrieved_at)}</Text>
              </View>
              <ConfidencePill pct={currentHour.confidence.overall} />
            </View>
            <View style={styles.heroStatsRow}>
              <HeroStat icon="thermometer" value={fmt(currentHour.soil_temp_c ?? currentHour.temperature_c, "°")} label={currentHour.soil_temp_c != null ? "Soil" : "Air"} />
              <HeroStat icon="water-percent" value={fmt(currentHour.soil_moisture != null ? currentHour.soil_moisture * 100 : undefined, "%")} label="Soil moist." />
              <HeroStat icon="weather-pouring" value={fmt(currentHour.precip_prob, "%")} label="Rain" />
              <HeroStat icon="snowflake" value={frost.risk} label="Frost 48h" />
            </View>
            {!hasSoilData && (
              <Text style={styles.heroWarn}>Soil temperature isn&apos;t available at this location yet — showing air temperature as a guide.</Text>
            )}
            <Text style={styles.heroDisc}>Indicative only. Always check actual soil conditions at the paddock before sowing.</Text>
          </View>
        ) : null}

        {bundle && bundle.models_failed.length > 0 ? (
          <View style={styles.modelWarning}>
            <Icon name="alert-outline" size={16} color={colors.warning} />
            <Text style={styles.modelWarningText}>{bundle.models_failed.length} weather source(s) didn&apos;t respond this time — showing a consensus from the rest.</Text>
          </View>
        ) : null}

        <SectionTitle>Operational conditions</SectionTitle>
        <View style={styles.opGrid}>
          <OpTile title="Sowing suitability" value={seedingWindows.length > 0 ? "Window found" : "Poor"} tone={seedingWindows.length > 0 ? "good" : "warn"} icon="seed-outline" />
          <OpTile title="Rain risk (24h)" value={`${rain.label} · ${rain.total}mm`} tone={rain.label === "Low" ? "good" : rain.label === "Moderate" ? "warn" : "bad"} icon="weather-pouring" />
          <OpTile title="Frost risk (48h)" value={frost.risk} tone={frost.risk === "None" ? "good" : frost.risk === "Watch" ? "warn" : "bad"} icon="snowflake" />
        </View>

        <SectionTitle>Best sowing windows</SectionTitle>
        {seedingWindows.length === 0 ? (
          <Card><Text style={styles.emptyBody}>No suitable sowing windows in the next 7 days — soil may be too cold, or rain is forecast.</Text></Card>
        ) : (
          seedingWindows.map((w, i) => (
            <View key={i} style={styles.windowCard}>
              <View style={styles.windowHeader}>
                <Icon name="seed-outline" size={18} color={colors.brandPrimary} />
                <Text style={styles.windowRange}>{formatDay(w.start)} · {formatTimeShort(w.start)} – {formatTimeShort(w.end)}</Text>
                <ConfidencePill pct={w.confidence} compact />
              </View>
              <Text style={styles.windowMeta}>Soil {w.soil_temp_range[0]}–{w.soil_temp_range[1]}°C</Text>
              <Text style={styles.windowFoot}>Recommendation only — always check conditions at the paddock.</Text>
            </View>
          ))
        )}

        <SectionTitle>Next 24 hours</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2, gap: 8 }}>
          {nextHours.map((h, i) => (
            <View key={i} style={styles.hourCard}>
              <Text style={styles.hourTime}>{formatTimeShort(h.valid_time)}</Text>
              <Text style={styles.hourTemp}>{fmt(h.soil_temp_c ?? h.temperature_c, "°")}</Text>
              <Text style={styles.hourRain}>{h.precip_prob != null ? `${Math.round(h.precip_prob)}%` : "—"}</Text>
              <View style={[styles.hourConfBar, { opacity: h.confidence.overall / 100 }]} />
            </View>
          ))}
        </ScrollView>

        <Text style={styles.pageFooter}>Data via Open-Meteo aggregating ECMWF · BOM · NOAA. Chaser Consensus is calculated locally; forecasts are indicative only.</Text>
      </ScrollView>
    </View>
  );
}

function LocationSelector({ farms, paddocks, target, onChange }: { farms: Farm[]; paddocks: Paddock[]; target: Target; onChange: (t: Target) => void }) {
  const paddocksForFarm = paddocks.filter((p) => p.farm_id === target.farm_id && coordsForPaddock(p) != null);
  return (
    <View style={styles.locWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {farms.map((f) => {
          const c = coordsForFarm(f, paddocks);
          const active = target.farm_id === f.id && target.kind === "farm";
          const hasCoords = c != null;
          return (
            <Pressable
              key={f.id}
              disabled={!hasCoords}
              onPress={() => c && onChange({ kind: "farm", id: f.id, label: f.name, lat: c.lat, lon: c.lon, farm_id: f.id })}
              style={[styles.locChip, active && styles.locChipActive, !hasCoords && styles.locChipDisabled]}
            >
              <Icon name="barn" size={14} color={active ? colors.onBrandPrimary : hasCoords ? colors.onSurface : colors.muted} />
              <Text style={[styles.locChipText, active && styles.locChipTextActive, !hasCoords && { color: colors.muted }]}>{f.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {paddocksForFarm.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 6 }}>
          <Pressable
            onPress={() => {
              const f = farms.find((x) => x.id === target.farm_id);
              const c = f ? coordsForFarm(f, paddocks) : null;
              if (f && c) onChange({ kind: "farm", id: f.id, label: f.name, lat: c.lat, lon: c.lon, farm_id: f.id });
            }}
            style={[styles.locSubChip, target.kind === "farm" && styles.locSubChipActive]}
          >
            <Text style={[styles.locSubText, target.kind === "farm" && styles.locSubTextActive]}>Whole farm</Text>
          </Pressable>
          {paddocksForFarm.map((p) => {
            const c = coordsForPaddock(p);
            const active = target.kind === "paddock" && target.id === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => c && onChange({ kind: "paddock", id: p.id, label: p.name, lat: c.lat, lon: c.lon, farm_id: p.farm_id! })}
                style={[styles.locSubChip, active && styles.locSubChipActive]}
              >
                <Text style={[styles.locSubText, active && styles.locSubTextActive]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

function HeroStat({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Icon name={icon as any} size={20} color={colors.onBrandPrimary} />
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function ConfidencePill({ pct, compact }: { pct: number; compact?: boolean }) {
  const label = confidenceLabel(pct);
  const bg = label === "High" ? "#DCFCE7" : label === "Moderate" ? "#FEF3C7" : "#FEE2E2";
  const fg = label === "High" ? "#166534" : label === "Moderate" ? "#92400E" : "#991B1B";
  return (
    <View style={[styles.confPill, { backgroundColor: bg }, compact && { paddingHorizontal: 8, paddingVertical: 3 }]}>
      <Icon name="target" size={compact ? 11 : 12} color={fg} />
      <Text style={[styles.confPillText, { color: fg }, compact && { fontSize: 10 }]}>{label} · {pct}%</Text>
    </View>
  );
}

function OpTile({ title, value, icon, tone }: { title: string; value: string; icon: string; tone: "good" | "warn" | "bad" }) {
  const bg = tone === "good" ? colors.brandSecondary : tone === "warn" ? "#FEF3C7" : "#FEE2E2";
  const fg = tone === "good" ? colors.brandPrimary : tone === "warn" ? "#92400E" : "#991B1B";
  return (
    <View style={[styles.opTile, { backgroundColor: bg, borderColor: fg }]}>
      <Icon name={icon as any} size={20} color={fg} />
      <Text style={[styles.opTileTitle, { color: fg }]}>{title}</Text>
      <Text style={[styles.opTileValue, { color: fg }]}>{value}</Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function fmt(v: number | undefined, suffix: string): string {
  if (v == null || isNaN(v)) return "—";
  return `${Math.round(v)}${suffix}`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", hour12: true }).replace(" ", "");
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return d.toLocaleDateString("en-AU", { weekday: "long" });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loading: { alignItems: "center", padding: spacing.xl, gap: 8 },
  loadingText: { color: colors.muted, fontSize: 12 },
  modelWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: radius.md, marginBottom: spacing.md },
  modelWarningText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 16, fontWeight: "600" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptyBody: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  locWrap: { marginBottom: spacing.md },
  locChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  locChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  locChipDisabled: { opacity: 0.45 },
  locChipText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  locChipTextActive: { color: colors.onBrandPrimary },
  locSubChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  locSubChipActive: { backgroundColor: colors.brandSecondary, borderColor: colors.brandPrimary },
  locSubText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  locSubTextActive: { color: colors.brandPrimary },
  heroCard: { backgroundColor: colors.brandPrimary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  heroSub: { color: colors.onBrandPrimary, fontSize: 11, opacity: 0.8, marginTop: 3 },
  heroStatsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatValue: { color: colors.onBrandPrimary, fontSize: 24, fontWeight: "800", marginTop: 4 },
  heroStatLabel: { color: colors.onBrandPrimary, fontSize: 10, opacity: 0.8, textTransform: "uppercase" },
  heroWarn: { color: colors.onBrandPrimary, fontSize: 11, marginTop: spacing.sm, opacity: 0.9 },
  heroDisc: { color: colors.onBrandPrimary, fontSize: 10, marginTop: spacing.md, fontStyle: "italic", opacity: 0.8 },
  confPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  confPillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: spacing.lg, marginBottom: spacing.sm },
  opGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  opTile: { width: "48%", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: 4 },
  opTileTitle: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  opTileValue: { fontSize: 15, fontWeight: "800" },
  windowCard: { backgroundColor: colors.brandSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  windowHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  windowRange: { flex: 1, color: colors.brandPrimary, fontWeight: "800", fontSize: 14 },
  windowMeta: { color: colors.onSurface, fontSize: 12, marginTop: 6 },
  windowFoot: { color: colors.muted, fontSize: 10, fontStyle: "italic", marginTop: 4 },
  hourCard: { width: 68, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: 8, alignItems: "center", gap: 2 },
  hourTime: { fontSize: 11, color: colors.muted, fontWeight: "700" },
  hourTemp: { fontSize: 16, color: colors.onSurface, fontWeight: "800" },
  hourRain: { fontSize: 10, color: colors.brandPrimary, fontWeight: "700" },
  hourConfBar: { height: 3, backgroundColor: colors.brandPrimary, borderRadius: 999, marginTop: 4, alignSelf: "stretch" },
  pageFooter: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: spacing.xl, fontStyle: "italic", lineHeight: 14 },
});
