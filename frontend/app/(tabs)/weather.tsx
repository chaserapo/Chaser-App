import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Icon from "@react-native-vector-icons/material-design-icons";
import { colors, radius, spacing } from "@/src/theme";
import { Card } from "@/src/components/ui";
import { repo } from "@/src/lib/storage";
import {
  runForecast,
  upsertLocationForFarm,
  findSprayWindows,
  loadThresholds,
  frostRiskNext48,
  heatRiskNext48,
  rainRiskNext24,
  confidenceLabel,
  MODELS,
  MODEL_META,
  type ForecastBundle,
  type ModelId,
  type SprayThresholds,
  DEFAULT_THRESHOLDS,
} from "@/src/lib/weather-intel";
import type { Farm, Paddock, PaddockBoundary } from "@/src/lib/types";

const STALE_MS = 45 * 60 * 1000; // 45 minutes — refresh if last fetch older than this

type TargetKind = "farm" | "paddock";
type Target = { kind: TargetKind; id: string; label: string; lat: number; lon: number; farm_id: string };

// ─── Coordinate helpers ─────────────────────────────────────────────
function polygonCentroid(b?: PaddockBoundary | null): { lat: number; lon: number } | null {
  if (!b || b.type !== "Polygon" || !b.coordinates || b.coordinates.length === 0) return null;
  const ring = b.coordinates[0]; // outer ring
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

export default function WeatherScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [bundle, setBundle] = useState<ForecastBundle | null>(null);
  const [thresholds, setThresholds] = useState<SprayThresholds>(DEFAULT_THRESHOLDS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedModelsHour, setExpandedModelsHour] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fs, ps] = await Promise.all([repo.farms.active(), repo.paddocks.active()]);
    setFarms(fs);
    setPaddocks(ps);
    if (!target && fs.length > 0) {
      // Pick the first farm with derivable coordinates from any of its
      // paddocks' boundaries.
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
      const [t, loc] = await Promise.all([
        loadThresholds(target.farm_id),
        // Register the location up-front so persistence has a location_id.
        upsertLocationForFarm(target.farm_id, target.lat, target.lon, target.label),
      ]);
      setThresholds(t);
      const locationId = loc?.id ?? null;
      const b = await runForecast({ locationId, lat: target.lat, lon: target.lon, source: "client" });
      setBundle(b);
    } catch (e) {
      console.warn("weather fetch failed", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [target]);

  // Auto-fetch when target changes or the previous fetch is stale.
  useEffect(() => {
    if (!target) return;
    const stale = !bundle || Date.now() - new Date(bundle.retrieved_at).getTime() > STALE_MS || bundle.location_id !== target.id;
    if (stale) runFetch();
  }, [target, bundle, runFetch]);

  const daily = bundle?.daily ?? [];
  const consensus = bundle?.consensus ?? [];
  const nextHours = useMemo(() => consensus.slice(0, 24), [consensus]);
  const currentHour = consensus[0];
  const sprayWindows = useMemo(() => findSprayWindows(consensus, thresholds), [consensus, thresholds]);
  const frost = useMemo(() => frostRiskNext48(consensus), [consensus]);
  const heat = useMemo(() => heatRiskNext48(consensus), [consensus]);
  const rain = useMemo(() => rainRiskNext24(daily), [daily]);

  // ─── Empty states ──────────────────────────────────────────────
  if (farms.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header />
        <View style={styles.emptyWrap}>
          <Icon name="weather-partly-cloudy" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>No farms yet</Text>
          <Text style={styles.emptyBody}>Add a farm from the Farms tab so Chaser can start pulling forecasts for it.</Text>
          <Pressable onPress={() => router.push("/farms")} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Go to Farms</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!target) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header />
        <View style={styles.emptyWrap}>
          <Icon name="crosshairs-gps" size={56} color={colors.muted} />
          <Text style={styles.emptyTitle}>Location required</Text>
          <Text style={styles.emptyBody}>None of your farms have paddock boundaries yet — Chaser uses paddock centroids to place your weather. Draw at least one paddock boundary on the Paddocks tab and Weather will start working.</Text>
          <Pressable onPress={() => router.push("/(tabs)/paddocks")} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Open Paddocks</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        rightAction={() => router.push({ pathname: "/weather/thresholds", params: { farmId: target.farm_id } })}
        rightLabel="Thresholds"
      />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); runFetch(); }} tintColor={colors.brandPrimary} />}
      >
        {/* Location picker */}
        <LocationSelector
          farms={farms}
          paddocks={paddocks}
          target={target}
          onChange={setTarget}
        />

        {/* Consensus header */}
        {loading && !bundle ? (
          <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.loadingText}>Fetching four independent models…</Text></View>
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
              <HeroStat icon="thermometer" value={fmt(currentHour.temperature_c, "°")} label="Temp" />
              <HeroStat icon="water-percent" value={fmt(currentHour.humidity_pct, "%")} label="RH" />
              <HeroStat icon="weather-windy" value={fmt(currentHour.wind_speed_kmh, "")} label="km/h" />
              <HeroStat icon="compass-outline" value={dirToCardinal(currentHour.wind_dir_deg)} label="Dir" />
            </View>
            <View style={styles.heroConfRow}>
              <ConfChip label="Temp" pct={currentHour.confidence.temperature} />
              <ConfChip label="Rain" pct={currentHour.confidence.rain} />
              <ConfChip label="Wind" pct={currentHour.confidence.wind} />
            </View>
            <Text style={styles.heroDisc}>Chaser Consensus Forecast — indicative only. Always check actual conditions at the application site.</Text>
          </View>
        ) : null}

        {bundle && bundle.models_failed.length > 0 ? (
          <View style={styles.modelWarning} testID="weather-model-warning">
            <Icon name="alert-outline" size={16} color={colors.warning} />
            <Text style={styles.modelWarningText}>
              {bundle.models_failed.length} of {MODELS.length} weather sources didn't respond this time ({bundle.models_failed.map((f) => MODEL_META[f.model].short).join(", ")}) — showing a consensus from the rest.
            </Text>
          </View>
        ) : null}

        {/* Operational conditions */}
        <SectionTitle>Operational Conditions</SectionTitle>
        <View style={styles.opGrid}>
          <OpTile title="Spray suitability" value={sprayWindows.length > 0 ? "Window found" : "Poor"} tone={sprayWindows.length > 0 ? "good" : "warn"} icon="sprinkler-variant" />
          <OpTile title="Rain risk (24h)" value={`${rain.label} · ${rain.total}mm`} tone={rain.label === "Low" ? "good" : rain.label === "Moderate" ? "warn" : "bad"} icon="weather-pouring" />
          <OpTile title="Frost risk (48h)" value={frost.risk} tone={frost.risk === "None" ? "good" : frost.risk === "Watch" ? "warn" : "bad"} icon="snowflake" />
          <OpTile title="Heat risk (48h)" value={heat.risk} tone={heat.risk === "None" ? "good" : heat.risk === "Watch" ? "warn" : "bad"} icon="weather-sunny-alert" />
        </View>

        {/* Best spraying windows */}
        <SectionTitle>Best spraying windows</SectionTitle>
        {sprayWindows.length === 0 ? (
          <Card><Text style={styles.emptyBody}>No suitable spraying windows in the next 7 days at your current thresholds. Tap Thresholds (top-right) to adjust.</Text></Card>
        ) : (
          sprayWindows.map((w, i) => (
            <View key={i} style={styles.windowCard}>
              <View style={styles.windowHeader}>
                <Icon name="sprinkler-variant" size={18} color={colors.brandPrimary} />
                <Text style={styles.windowRange}>{formatDay(w.start)} · {formatTimeShort(w.start)} – {formatTimeShort(w.end)}</Text>
                <ConfidencePill pct={w.confidence} compact />
              </View>
              <Text style={styles.windowMeta}>
                Wind {w.wind_range[0]}–{w.wind_range[1]} km/h · Gusts {w.gust_max} km/h · RH {w.humidity_range[0]}–{w.humidity_range[1]}% · Rain risk {w.rain_risk}
              </Text>
              <Text style={styles.windowFoot}>Recommendation only — always follow product-label conditions and legal requirements.</Text>
            </View>
          ))
        )}

        {/* Next 24 hours strip */}
        <SectionTitle>Next 24 hours</SectionTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 2, gap: 8 }}>
          {nextHours.map((h, i) => (
            <View key={i} style={styles.hourCard}>
              <Text style={styles.hourTime}>{formatTimeShort(h.valid_time)}</Text>
              <Text style={styles.hourTemp}>{fmt(h.temperature_c, "°")}</Text>
              <Text style={styles.hourWind}>{fmt(h.wind_speed_kmh, "")} km/h</Text>
              <Text style={styles.hourRain}>{h.precip_prob != null ? `${Math.round(h.precip_prob)}%` : "—"}</Text>
              <View style={[styles.hourConfBar, { opacity: h.confidence.overall / 100 }]} />
            </View>
          ))}
        </ScrollView>

        {/* 7-day */}
        <SectionTitle>7-day forecast</SectionTitle>
        {daily.slice(0, 7).map((d) => (
          <View key={d.date} style={styles.dayRow}>
            <View style={{ width: 92 }}>
              <Text style={styles.dayName}>{formatDayName(d.date)}</Text>
              <Text style={styles.dayDate}>{formatDayShort(d.date)}</Text>
            </View>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="thermometer-low" size={16} color={colors.muted} />
              <Text style={styles.dayVal}>{fmt(d.temp_min_c, "°")}</Text>
              <Icon name="thermometer-high" size={16} color={colors.muted} />
              <Text style={styles.dayVal}>{fmt(d.temp_max_c, "°")}</Text>
              <Icon name="weather-pouring" size={16} color={colors.muted} />
              <Text style={styles.dayVal}>{d.precip_total_mm ?? 0}mm</Text>
              <Icon name="weather-windy" size={16} color={colors.muted} />
              <Text style={styles.dayVal}>{fmt(d.wind_max_kmh, "")}km/h</Text>
            </View>
            <ConfidencePill pct={d.confidence.overall} compact />
          </View>
        ))}

        {/* Model comparison */}
        <SectionTitle>Model comparison</SectionTitle>
        <Text style={styles.modelIntroBody}>Chaser fetches each model independently so you can see where they agree — and disagree. Only advanced users usually need this.</Text>
        <View style={{ marginTop: spacing.sm }}>
          {(["temperature_c", "precip_mm", "wind_speed_kmh"] as const).map((field) => (
            <ModelCompareCard
              key={field}
              field={field}
              bundle={bundle}
              expanded={expandedModelsHour === field}
              onToggle={() => setExpandedModelsHour(expandedModelsHour === field ? null : field)}
            />
          ))}
        </View>

        {/* Alerts entry point */}
        <SectionTitle>Alerts & Accuracy</SectionTitle>
        <Pressable onPress={() => router.push({ pathname: "/weather/alerts", params: { farmId: target.farm_id } })} style={styles.alertsRow} testID="weather-alerts-btn">
          <Icon name="bell-outline" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertsTitle}>Manage weather alerts</Text>
            <Text style={styles.alertsSub}>Spray windows · rain · frost · wind — delivery via push once wired to devices</Text>
          </View>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: "/weather/accuracy" })} style={[styles.alertsRow, { marginTop: 8 }]} testID="weather-accuracy-btn">
          <Icon name="chart-line" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertsTitle}>Model accuracy scorecard</Text>
            <Text style={styles.alertsSub}>Which model has been closest at your place — updates as history grows</Text>
          </View>
          <Icon name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

        <Text style={styles.pageFooter}>Data via Open-Meteo aggregating ECMWF · BOM · NOAA. Chaser Consensus is calculated locally by weighted mean; forecasts are indicative only.</Text>
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────
function Header({ rightAction, rightLabel }: { rightAction?: () => void; rightLabel?: string }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.headerTitle}>Weather</Text>
        <Text style={styles.headerSub}>Chaser Weather Intelligence</Text>
      </View>
      {rightAction ? (
        <Pressable onPress={rightAction} style={styles.headerAction} testID="weather-thresholds-btn">
          <Icon name="tune-variant" size={18} color={colors.brandPrimary} />
          <Text style={styles.headerActionText}>{rightLabel}</Text>
        </Pressable>
      ) : null}
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
              testID={`weather-farm-${f.id}`}
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

function ConfChip({ label, pct }: { label: string; pct: number }) {
  const tone = confidenceLabel(pct);
  const dot = tone === "High" ? "#16A34A" : tone === "Moderate" ? "#D97706" : "#DC2626";
  return (
    <View style={styles.confChip}>
      <View style={[styles.confDot, { backgroundColor: dot }]} />
      <Text style={styles.confChipLabel}>{label}</Text>
      <Text style={styles.confChipPct}>{pct}%</Text>
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

function ModelCompareCard({
  field, bundle, expanded, onToggle,
}: { field: "temperature_c" | "precip_mm" | "wind_speed_kmh"; bundle: ForecastBundle | null; expanded: boolean; onToggle: () => void }) {
  const title = field === "temperature_c" ? "Temperature (°C)" : field === "precip_mm" ? "Rainfall (mm/h)" : "Wind (km/h)";
  return (
    <Pressable onPress={onToggle} style={styles.modelCard} testID={`model-compare-${field}`}>
      <View style={styles.modelHeader}>
        <Text style={styles.modelTitle}>{title}</Text>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
      </View>
      {expanded && bundle ? (
        <View>
          {MODELS.map((m) => {
            const hours = bundle.by_model[m.id];
            if (!hours || hours.length === 0) {
              return (
                <View key={m.id} style={styles.modelRow}>
                  <Text style={styles.modelRowLabel}>{m.label}</Text>
                  <Text style={styles.modelRowMissing}>no data</Text>
                </View>
              );
            }
            const now = hours[0][field] as number | undefined;
            const in6 = hours[6]?.[field] as number | undefined;
            const in24 = hours[24]?.[field] as number | undefined;
            return (
              <View key={m.id} style={styles.modelRow}>
                <Text style={styles.modelRowLabel}>{m.label}</Text>
                <View style={styles.modelValues}>
                  <ModelCell label="now" v={now} field={field} />
                  <ModelCell label="+6h" v={in6} field={field} />
                  <ModelCell label="+24h" v={in24} field={field} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

function ModelCell({ label, v, field }: { label: string; v?: number; field: string }) {
  return (
    <View style={styles.modelCell}>
      <Text style={styles.modelCellLabel}>{label}</Text>
      <Text style={styles.modelCellValue}>{v != null ? (field === "precip_mm" ? v.toFixed(1) : Math.round(v).toString()) : "—"}</Text>
    </View>
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────
function fmt(v: number | undefined, suffix: string): string {
  if (v == null || isNaN(v)) return "—";
  return `${Math.round(v)}${suffix}`;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-AU", { hour: "numeric", hour12: true }).replace(" ", "");
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yday = new Date(today); yday.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yday.toDateString())  return "Tomorrow";
  return d.toLocaleDateString("en-AU", { weekday: "long" });
}

function formatDayName(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString("en-AU", { weekday: "long" });
}

function formatDayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function dirToCardinal(deg?: number): string {
  if (deg == null) return "—";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  headerSub: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: "600" },
  headerAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface },
  headerActionText: { color: colors.brandPrimary, fontWeight: "700", fontSize: 12 },

  loading: { alignItems: "center", padding: spacing.xl, gap: 8 },
  loadingText: { color: colors.muted, fontSize: 12 },

  modelWarning: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF3C7", padding: 10, borderRadius: radius.md, marginBottom: spacing.md },
  modelWarningText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 16, fontWeight: "600" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  emptyBody: { fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 18 },
  primaryBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.md },
  primaryBtnText: { color: colors.onBrandPrimary, fontWeight: "800" },

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
  heroConfRow: { flexDirection: "row", gap: 8, marginTop: spacing.md },
  heroDisc: { color: colors.onBrandPrimary, fontSize: 10, marginTop: spacing.md, fontStyle: "italic", opacity: 0.8 },

  confPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  confPillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4 },
  confChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  confChipLabel: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "700" },
  confChipPct: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800" },

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
  hourWind: { fontSize: 10, color: colors.onSurfaceTertiary },
  hourRain: { fontSize: 10, color: colors.brandPrimary, fontWeight: "700" },
  hourConfBar: { height: 3, backgroundColor: colors.brandPrimary, borderRadius: 999, marginTop: 4, alignSelf: "stretch" },

  dayRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dayName: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  dayDate: { fontSize: 10, color: colors.muted, marginTop: 1 },
  dayVal: { fontSize: 12, color: colors.onSurface, fontWeight: "700" },

  modelIntroBody: { fontSize: 12, color: colors.muted },
  modelCard: { backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 8, padding: spacing.md },
  modelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modelTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  modelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 },
  modelRowLabel: { fontSize: 12, color: colors.onSurface, fontWeight: "700", flex: 1 },
  modelRowMissing: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  modelValues: { flexDirection: "row", gap: 12 },
  modelCell: { alignItems: "center", minWidth: 44 },
  modelCellLabel: { fontSize: 9, color: colors.muted, fontWeight: "700", textTransform: "uppercase" },
  modelCellValue: { fontSize: 14, color: colors.onSurface, fontWeight: "800" },

  alertsRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  alertsTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  alertsSub: { fontSize: 11, color: colors.muted, marginTop: 2 },

  pageFooter: { color: colors.muted, fontSize: 10, textAlign: "center", marginTop: spacing.xl, fontStyle: "italic", lineHeight: 14 },
});
