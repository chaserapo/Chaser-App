// Chaser Weather Intelligence — client-side lib.
//
// Responsibilities:
//   1. Fetch the same hourly forecast from six independent numeric weather
//      models via Open-Meteo (ECMWF IFS, ECMWF AIFS, BOM ACCESS-G, NOAA GFS,
//      DWD ICON, Météo-France ARPEGE).
//   2. Compute a Chaser Consensus Forecast — weighted mean + circular vector
//      average for wind direction — and a confidence score based on
//      inter-model agreement.
//   3. Find "best spray window" blocks against the farm's spray thresholds.
//   4. Persist each fetch to Supabase so historical accuracy can be
//      calculated later.
//
// This lib is intentionally provider-agnostic behind the ForecastFetcher
// interface so new sources (Windy, MetService, direct BOM) can be added
// without changing the consensus/UX code.

import { supabase } from "./supabase";
import { getActiveBusinessId } from "./backend";

export type ModelId =
  | "ecmwf_ifs025"
  | "ecmwf_aifs025_single"
  | "bom_access_global"
  | "gfs_seamless"
  | "dwd_icon_global"
  | "meteofrance_arpege_world";

export const MODELS: { id: ModelId; label: string; provider: string }[] = [
  { id: "ecmwf_ifs025",       label: "ECMWF IFS",   provider: "ECMWF" },
  { id: "ecmwf_aifs025_single",     label: "ECMWF AIFS",  provider: "ECMWF" },
  { id: "bom_access_global", label: "BOM ACCESS-G", provider: "BOM" },
  { id: "gfs_seamless",      label: "NOAA GFS",    provider: "NOAA" },
  { id: "dwd_icon_global",   label: "DWD ICON",    provider: "DWD" },
  { id: "meteofrance_arpege_world", label: "Météo-France ARPEGE", provider: "Météo-France" },
];

// Short + long labels for compact UI (accuracy scorecard, model chips).
export const MODEL_META: Record<ModelId, { short: string; long: string; provider: string }> = {
  ecmwf_ifs025:       { short: "ECMWF IFS",   long: "ECMWF Integrated Forecasting System", provider: "ECMWF" },
  ecmwf_aifs025_single:     { short: "ECMWF AIFS",  long: "ECMWF AI Forecasting System",         provider: "ECMWF" },
  bom_access_global: { short: "BOM ACCESS-G", long: "Bureau of Meteorology ACCESS Global", provider: "BOM" },
  gfs_seamless:      { short: "NOAA GFS",    long: "NOAA Global Forecast System",          provider: "NOAA" },
  dwd_icon_global:   { short: "DWD ICON",    long: "Deutscher Wetterdienst ICON Global",   provider: "DWD" },
  meteofrance_arpege_world: { short: "Météo-France ARPEGE", long: "Météo-France ARPEGE World", provider: "Météo-France" },
};

export type HourlyVars = {
  temperature_c?: number;
  apparent_temp_c?: number;
  precip_mm?: number;
  precip_prob?: number;
  rain_mm?: number;
  showers_mm?: number;
  snowfall_cm?: number;
  wind_speed_kmh?: number;
  wind_gust_kmh?: number;
  wind_dir_deg?: number;
  humidity_pct?: number;
  dew_point_c?: number;
  cloud_cover_pct?: number;
  pressure_hpa?: number;
  soil_temp_c?: number;
  soil_moisture?: number;
  et0_mm?: number;
};

export type ModelHour = HourlyVars & { model: ModelId; valid_time: string; horizon_h: number };

export type ConsensusHour = HourlyVars & {
  valid_time: string;
  horizon_h: number;
  n_models: number;
  confidence: { overall: number; temperature: number; rain: number; wind: number };
};

export type ForecastBundle = {
  location_id: string | null;
  lat: number;
  lon: number;
  retrieved_at: string;
  models_returned: ModelId[];
  models_failed: ModelFailure[];
  by_model: Record<ModelId, ModelHour[]>;
  consensus: ConsensusHour[];
  daily: DailyConsensus[];
};

export type DailyConsensus = {
  date: string;                        // YYYY-MM-DD in the local zone
  temp_min_c?: number;
  temp_max_c?: number;
  precip_total_mm?: number;
  precip_prob_max?: number;
  wind_max_kmh?: number;
  gust_max_kmh?: number;
  confidence: { overall: number; temperature: number; rain: number; wind: number };
};

export type SprayThresholds = {
  wind_min_kmh: number;
  wind_max_kmh: number;
  gust_max_kmh: number;
  humidity_min_pct: number;
  humidity_max_pct: number;
  temp_max_c: number;
  delta_t_max: number;
  rain_free_hours_after: number;
};

export const DEFAULT_THRESHOLDS: SprayThresholds = {
  wind_min_kmh: 3,
  wind_max_kmh: 15,
  gust_max_kmh: 20,
  humidity_min_pct: 40,
  humidity_max_pct: 95,
  temp_max_c: 30,
  delta_t_max: 10,
  rain_free_hours_after: 4,
};

// ─── Open-Meteo variables we ask for ───────────────────────────────────────
const HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation",
  "precipitation_probability",
  "rain",
  "showers",
  "snowfall",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "relative_humidity_2m",
  "dew_point_2m",
  "cloud_cover",
  "surface_pressure",
  "soil_temperature_0cm",
  "soil_moisture_0_to_1cm",
  "et0_fao_evapotranspiration",
].join(",");

const MAP: Record<string, keyof HourlyVars> = {
  temperature_2m: "temperature_c",
  apparent_temperature: "apparent_temp_c",
  precipitation: "precip_mm",
  precipitation_probability: "precip_prob",
  rain: "rain_mm",
  showers: "showers_mm",
  snowfall: "snowfall_cm",
  wind_speed_10m: "wind_speed_kmh",
  wind_gusts_10m: "wind_gust_kmh",
  wind_direction_10m: "wind_dir_deg",
  relative_humidity_2m: "humidity_pct",
  dew_point_2m: "dew_point_c",
  cloud_cover: "cloud_cover_pct",
  surface_pressure: "pressure_hpa",
  soil_temperature_0cm: "soil_temp_c",
  soil_moisture_0_to_1cm: "soil_moisture",
  et0_fao_evapotranspiration: "et0_mm",
};

// ─── Fetcher ───────────────────────────────────────────────────────────────
// Every model is queried through the general /v1/forecast endpoint with
// &models=<id> — that's how Open-Meteo's own API docs document the `models`
// parameter (a plain string array on /v1/forecast, default "auto"). An
// earlier version of this code routed ECMWF and BOM to their own dedicated
// /v1/ecmwf and /v1/bom subdomains instead, which turned out to serve a
// stale model catalog (ecmwf_ifs04 accepted the request but returned null
// for every hour; bom_access_global did the same on /v1/bom). Confirmed
// live against the API: /v1/forecast is the actively-maintained endpoint.
async function fetchOnceRaw(model: ModelId, lat: number, lon: number, days: number, timeoutMs: number): Promise<ModelHour[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_VARS}` +
    `&wind_speed_unit=kmh&timezone=auto&forecast_days=${days}` +
    `&models=${model}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${model} ${res.status}`);
    const j: any = await res.json();
    const hours: ModelHour[] = [];
    const times: string[] = j?.hourly?.time ?? [];
    const nowMs = Date.now();

    // The dedicated per-provider endpoints (/v1/ecmwf, /v1/bom) sometimes
    // suffix hourly variable names with the model id (e.g.
    // "temperature_2m_ecmwf_ifs025") instead of the flat name the general
    // /v1/forecast endpoint uses. Resolve each variable to whatever key is
    // actually present once per response, rather than assuming the flat
    // name — otherwise these models "succeed" (non-empty time array) while
    // every value silently comes back undefined.
    const hourlyKeys: string[] = j?.hourly ? Object.keys(j.hourly) : [];
    const resolvedKey: Record<string, string | undefined> = {};
    for (const k of Object.keys(MAP)) {
      resolvedKey[k] = hourlyKeys.includes(k) ? k : hourlyKeys.find((hk) => hk.startsWith(`${k}_`));
    }

    for (let i = 0; i < times.length; i++) {
      const validIso = times[i];
      const validMs = new Date(validIso).getTime();
      if (isNaN(validMs)) continue;
      const hour: ModelHour = {
        model,
        valid_time: new Date(validMs).toISOString(),
        horizon_h: Math.round((validMs - nowMs) / 3_600_000),
      };
      for (const k of Object.keys(MAP)) {
        const rk = resolvedKey[k];
        if (!rk) continue;
        const arr = j.hourly[rk];
        if (Array.isArray(arr) && arr[i] != null) (hour as any)[MAP[k]] = arr[i] as number;
      }
      hours.push(hour);
    }
    // A response with times but every variable unresolved is effectively
    // useless — treat it as a failure so it shows up in the "sources didn't
    // respond" banner instead of silently rendering as dashes with no
    // explanation of why.
    if (hours.length > 0 && !Object.values(resolvedKey).some((v) => v != null)) {
      throw new Error(`open-meteo ${model}: no recognized hourly variables in response`);
    }
    return hours;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOne(model: ModelId, lat: number, lon: number, horizonH: number): Promise<ModelHour[]> {
  const days = Math.max(1, Math.ceil(horizonH / 24));
  try {
    return await fetchOnceRaw(model, lat, lon, days, 25_000);
  } catch {
    // One retry - a single slow/dropped request on mobile shouldn't cost a
    // model out of the consensus for the next 45 minutes (the stale-refetch
    // window). If the retry fails too, log why before giving up — a
    // consistently-failing model (e.g. a renamed/retired Open-Meteo model id)
    // was previously invisible since this error was swallowed entirely.
    try {
      return await fetchOnceRaw(model, lat, lon, days, 25_000);
    } catch (e2: any) {
      console.warn(`weather model "${model}" failed twice:`, e2?.message ?? e2);
      throw e2;
    }
  }
}

export type ModelFailure = { model: ModelId; reason: string };

export async function fetchAllModels(
  lat: number,
  lon: number,
  horizonH = 168,
): Promise<{ byModel: Record<ModelId, ModelHour[]>; failed: ModelFailure[] }> {
  const results = await Promise.allSettled(MODELS.map((m) => fetchOne(m.id, lat, lon, horizonH)));
  const byModel: Record<ModelId, ModelHour[]> = {} as any;
  const failed: ModelFailure[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 0) {
      byModel[MODELS[i].id] = r.value;
    } else {
      failed.push({
        model: MODELS[i].id,
        reason: r.status === "rejected" ? (r.reason?.message ?? String(r.reason)) : "empty response",
      });
    }
  });
  return { byModel, failed };
}

// ─── Consensus ─────────────────────────────────────────────────────────────
function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }

function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Circular (vector) mean for bearings 0–360, weighted equally. */
function circularMean(degs: number[]): number {
  let sinS = 0, cosS = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sinS += Math.sin(r);
    cosS += Math.cos(r);
  }
  let deg = (Math.atan2(sinS / degs.length, cosS / degs.length) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

/** Circular resultant length R ∈ [0,1] — used for wind-direction confidence. */
function circularR(degs: number[]): number {
  if (degs.length < 2) return 1;
  let sinS = 0, cosS = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sinS += Math.sin(r);
    cosS += Math.cos(r);
  }
  return Math.sqrt((sinS / degs.length) ** 2 + (cosS / degs.length) ** 2);
}

/** Turn a stddev into a 0-100 confidence, given a scale where "0 disagreement" ≈ 100. */
function confFromStdev(sd: number, scale: number): number {
  const c = 100 * (1 - Math.min(1, sd / scale));
  return Math.round(Math.max(0, Math.min(100, c)));
}

export function computeConsensus(byModel: Record<ModelId, ModelHour[]>): ConsensusHour[] {
  // Bucket by valid_time (rounded to the hour) across every returned model.
  const buckets = new Map<string, ModelHour[]>();
  for (const model of Object.keys(byModel) as ModelId[]) {
    for (const h of byModel[model]) {
      const key = h.valid_time;
      const arr = buckets.get(key) ?? [];
      arr.push(h);
      buckets.set(key, arr);
    }
  }
  const out: ConsensusHour[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort();
  for (const k of sortedKeys) {
    const hours = buckets.get(k) ?? [];
    if (hours.length === 0) continue;
    const c: ConsensusHour = {
      valid_time: k,
      horizon_h: hours[0].horizon_h,
      n_models: hours.length,
      confidence: { overall: 100, temperature: 100, rain: 100, wind: 100 },
    };
    const gather = (key: keyof HourlyVars): number[] =>
      hours.map((h) => h[key] as number | undefined).filter((v): v is number => typeof v === "number");

    // Linear averages
    for (const k2 of Object.keys(MAP) as (keyof typeof MAP)[]) {
      const field = MAP[k2];
      if (field === "wind_dir_deg") continue;
      const vs = gather(field);
      if (vs.length > 0) (c as any)[field] = round1(mean(vs));
    }
    // Wind direction — circular average
    const dirs = gather("wind_dir_deg");
    if (dirs.length > 0) c.wind_dir_deg = Math.round(circularMean(dirs));

    // Confidence — inter-model agreement per variable
    const tempSd  = stddev(gather("temperature_c"));
    const rainSd  = stddev(gather("precip_mm"));
    const windSd  = stddev(gather("wind_speed_kmh"));
    const windR   = dirs.length >= 2 ? circularR(dirs) : 1;

    // Scales tuned so a ±2°C, ±2 mm/h, ±5 km/h spread lands around 80.
    const tempConf = confFromStdev(tempSd, 4);
    const rainConf = Math.round(confFromStdev(rainSd, 3));
    const windConf = Math.round(Math.min(confFromStdev(windSd, 6), 100 * windR));

    c.confidence = {
      temperature: tempConf,
      rain: rainConf,
      wind: windConf,
      overall: Math.round(0.4 * rainConf + 0.35 * windConf + 0.25 * tempConf),
    };

    // Single-model hour → confidence collapses. Flag with -1 for the UI later.
    if (hours.length < 2) {
      c.confidence = { overall: 50, temperature: 50, rain: 50, wind: 50 };
    }
    out.push(c);
  }
  return out;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

// ─── Daily aggregate ───────────────────────────────────────────────────────
export function buildDaily(consensus: ConsensusHour[]): DailyConsensus[] {
  const byDay = new Map<string, ConsensusHour[]>();
  for (const c of consensus) {
    const d = c.valid_time.slice(0, 10);
    const arr = byDay.get(d) ?? [];
    arr.push(c);
    byDay.set(d, arr);
  }
  const days = Array.from(byDay.keys()).sort();
  return days.map((d) => {
    const hs = byDay.get(d)!;
    const temps = hs.map((h) => h.temperature_c).filter((v): v is number => typeof v === "number");
    const rains = hs.map((h) => h.precip_mm).filter((v): v is number => typeof v === "number");
    const probs = hs.map((h) => h.precip_prob).filter((v): v is number => typeof v === "number");
    const winds = hs.map((h) => h.wind_speed_kmh).filter((v): v is number => typeof v === "number");
    const gusts = hs.map((h) => h.wind_gust_kmh).filter((v): v is number => typeof v === "number");
    const confOverall = Math.round(mean(hs.map((h) => h.confidence.overall)));
    const confTemp = Math.round(mean(hs.map((h) => h.confidence.temperature)));
    const confRain = Math.round(mean(hs.map((h) => h.confidence.rain)));
    const confWind = Math.round(mean(hs.map((h) => h.confidence.wind)));
    return {
      date: d,
      temp_min_c: temps.length ? round1(Math.min(...temps)) : undefined,
      temp_max_c: temps.length ? round1(Math.max(...temps)) : undefined,
      precip_total_mm: rains.length ? round1(rains.reduce((a, b) => a + b, 0)) : undefined,
      precip_prob_max: probs.length ? Math.round(Math.max(...probs)) : undefined,
      wind_max_kmh: winds.length ? round1(Math.max(...winds)) : undefined,
      gust_max_kmh: gusts.length ? round1(Math.max(...gusts)) : undefined,
      confidence: { overall: confOverall, temperature: confTemp, rain: confRain, wind: confWind },
    };
  });
}

// ─── Spray windows ─────────────────────────────────────────────────────────
export type SprayWindow = {
  start: string;
  end: string;
  hours: number;
  wind_range: [number, number];
  gust_max: number;
  humidity_range: [number, number];
  rain_risk: "Low" | "Moderate" | "High";
  confidence: number;
};

export function findSprayWindows(consensus: ConsensusHour[], t: SprayThresholds): SprayWindow[] {
  const ok = (h: ConsensusHour): boolean => {
    if (h.wind_speed_kmh == null) return false;
    if (h.wind_speed_kmh < t.wind_min_kmh || h.wind_speed_kmh > t.wind_max_kmh) return false;
    if (h.wind_gust_kmh != null && h.wind_gust_kmh > t.gust_max_kmh) return false;
    if (h.humidity_pct != null && (h.humidity_pct < t.humidity_min_pct || h.humidity_pct > t.humidity_max_pct)) return false;
    if (h.temperature_c != null && h.temperature_c > t.temp_max_c) return false;
    if (h.precip_prob != null && h.precip_prob > 40) return false;
    if (h.precip_mm != null && h.precip_mm > 0.2) return false;
    return true;
  };
  const nowMs = Date.now();
  const hs = consensus.filter((c) => new Date(c.valid_time).getTime() >= nowMs - 3600_000);
  const windows: SprayWindow[] = [];
  let cur: ConsensusHour[] = [];
  const flush = () => {
    if (cur.length < 2) { cur = []; return; }
    const winds = cur.map((h) => h.wind_speed_kmh!).filter((v) => v != null);
    const gusts = cur.map((h) => h.wind_gust_kmh ?? 0);
    const hums  = cur.map((h) => h.humidity_pct ?? 0);
    const confs = cur.map((h) => h.confidence.overall);
    const rainProb = Math.max(...cur.map((h) => h.precip_prob ?? 0));
    const risk: SprayWindow["rain_risk"] = rainProb > 30 ? "Moderate" : rainProb > 10 ? "Low" : "Low";
    windows.push({
      start: cur[0].valid_time,
      end: cur[cur.length - 1].valid_time,
      hours: cur.length,
      wind_range: [Math.round(Math.min(...winds)), Math.round(Math.max(...winds))],
      gust_max: Math.round(Math.max(...gusts)),
      humidity_range: [Math.round(Math.min(...hums)), Math.round(Math.max(...hums))],
      rain_risk: risk,
      confidence: Math.round(mean(confs)),
    });
    cur = [];
  };
  for (const h of hs) {
    if (ok(h)) cur.push(h);
    else flush();
  }
  flush();
  // Only surface the next ~5 upcoming windows to keep the UI focused.
  return windows.slice(0, 5);
}

// ─── Operational conditions helpers ────────────────────────────────────────
export function frostRiskNext48(consensus: ConsensusHour[]): { risk: "None" | "Watch" | "Likely"; when?: string } {
  const now = Date.now();
  const window = consensus.filter((c) => {
    const t = new Date(c.valid_time).getTime();
    return t >= now && t <= now + 48 * 3600_000;
  });
  let coldest: ConsensusHour | undefined;
  for (const h of window) {
    if (h.temperature_c != null && (!coldest || h.temperature_c < (coldest.temperature_c ?? 99))) coldest = h;
  }
  if (!coldest || coldest.temperature_c == null) return { risk: "None" };
  if (coldest.temperature_c <= 0)  return { risk: "Likely", when: coldest.valid_time };
  if (coldest.temperature_c <= 3)  return { risk: "Watch",  when: coldest.valid_time };
  return { risk: "None" };
}

export function heatRiskNext48(consensus: ConsensusHour[]): { risk: "None" | "Watch" | "Extreme"; when?: string } {
  const now = Date.now();
  const window = consensus.filter((c) => {
    const t = new Date(c.valid_time).getTime();
    return t >= now && t <= now + 48 * 3600_000;
  });
  let hottest: ConsensusHour | undefined;
  for (const h of window) {
    if (h.temperature_c != null && (!hottest || h.temperature_c > (hottest.temperature_c ?? -99))) hottest = h;
  }
  if (!hottest || hottest.temperature_c == null) return { risk: "None" };
  if (hottest.temperature_c >= 38) return { risk: "Extreme", when: hottest.valid_time };
  if (hottest.temperature_c >= 32) return { risk: "Watch",   when: hottest.valid_time };
  return { risk: "None" };
}

export function rainRiskNext24(daily: DailyConsensus[]): { total: number; prob: number; label: "Low" | "Moderate" | "High" } {
  const d = daily[0];
  const total = d?.precip_total_mm ?? 0;
  const prob  = d?.precip_prob_max ?? 0;
  const label = total > 5 || prob > 70 ? "High" : total > 1 || prob > 40 ? "Moderate" : "Low";
  return { total: round1(total), prob: Math.round(prob), label };
}

// ─── Persistence ──────────────────────────────────────────────────────────
export async function persistRun(bundle: ForecastBundle, source: "client" | "cron"): Promise<string | null> {
  const businessId = getActiveBusinessId();
  if (!businessId || !bundle.location_id) return null;

  const requested: ModelId[] = MODELS.map((m) => m.id);
  const summary = {
    consensus_hours: bundle.consensus.length,
    daily: bundle.daily.map((d) => ({ date: d.date, tmin: d.temp_min_c, tmax: d.temp_max_c, rain: d.precip_total_mm, conf: d.confidence.overall })),
  };

  const { data: runRow, error: runErr } = await supabase
    .from("weather_forecast_runs")
    .insert({
      business_id: businessId,
      location_id: bundle.location_id,
      retrieved_at: bundle.retrieved_at,
      source,
      models_requested: requested,
      models_returned: bundle.models_returned,
      horizon_hours: 168,
      raw_summary: summary,
    })
    .select("id")
    .single();
  if (runErr || !runRow) { console.warn("weather runs insert failed", runErr); return null; }

  const runId = runRow.id;
  const rows: any[] = [];
  for (const model of bundle.models_returned) {
    for (const h of bundle.by_model[model] ?? []) {
      rows.push({
        business_id: businessId,
        run_id: runId,
        location_id: bundle.location_id,
        model,
        valid_time: h.valid_time,
        horizon_hours: h.horizon_h,
        temperature_c: h.temperature_c ?? null,
        apparent_temp_c: h.apparent_temp_c ?? null,
        precip_mm: h.precip_mm ?? null,
        precip_prob: h.precip_prob ?? null,
        rain_mm: h.rain_mm ?? null,
        showers_mm: h.showers_mm ?? null,
        snowfall_cm: h.snowfall_cm ?? null,
        wind_speed_kmh: h.wind_speed_kmh ?? null,
        wind_gust_kmh: h.wind_gust_kmh ?? null,
        wind_dir_deg: h.wind_dir_deg ?? null,
        humidity_pct: h.humidity_pct ?? null,
        dew_point_c: h.dew_point_c ?? null,
        cloud_cover_pct: h.cloud_cover_pct ?? null,
        pressure_hpa: h.pressure_hpa ?? null,
        soil_temp_c: h.soil_temp_c ?? null,
        soil_moisture: h.soil_moisture ?? null,
        et0_mm: h.et0_mm ?? null,
      });
    }
  }
  if (rows.length > 0) {
    // Chunked insert — Supabase caps at ~1000 rows per call.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase.from("weather_forecast_hours").insert(chunk);
      if (error) { console.warn("weather hours insert failed", error); break; }
    }
  }
  return runId;
}

/** Convenience: fetch + consensus + persist. */
export async function runForecast(params: { locationId: string | null; lat: number; lon: number; source?: "client" | "cron" }): Promise<ForecastBundle> {
  const { byModel, failed } = await fetchAllModels(params.lat, params.lon);
  const models = Object.keys(byModel) as ModelId[];
  if (failed.length > 0) console.warn("weather models unavailable:", failed);
  const consensus = computeConsensus(byModel);
  const daily = buildDaily(consensus);
  const bundle: ForecastBundle = {
    location_id: params.locationId,
    lat: params.lat,
    lon: params.lon,
    retrieved_at: new Date().toISOString(),
    models_returned: models,
    models_failed: failed,
    by_model: byModel,
    consensus,
    daily,
  };
  if (params.locationId) {
    try { await persistRun(bundle, params.source ?? "client"); }
    catch (e) { console.warn("persistRun failed", e); }
  }
  return bundle;
}

// ─── Weather locations repo ────────────────────────────────────────────────
export type WeatherLocation = {
  id: string;
  business_id: string;
  farm_id?: string | null;
  paddock_id?: string | null;
  lat: number;
  lon: number;
  label?: string | null;
};

export async function upsertLocationForFarm(farmId: string, lat: number, lon: number, label?: string): Promise<WeatherLocation | null> {
  const businessId = getActiveBusinessId();
  if (!businessId) return null;
  // Look for an existing row for this farm — one per farm keeps the table tidy.
  const { data: existing } = await supabase
    .from("weather_locations")
    .select("*")
    .eq("business_id", businessId)
    .eq("farm_id", farmId)
    .is("paddock_id", null)
    .maybeSingle();
  if (existing) {
    if (existing.lat !== lat || existing.lon !== lon || existing.label !== label) {
      await supabase.from("weather_locations").update({ lat, lon, label, updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return existing as WeatherLocation;
  }
  const { data: created, error } = await supabase
    .from("weather_locations")
    .insert({ business_id: businessId, farm_id: farmId, lat, lon, label })
    .select("*")
    .single();
  if (error) { console.warn("upsertLocationForFarm failed", error); return null; }
  return created as WeatherLocation;
}

export async function loadThresholds(farmId: string): Promise<SprayThresholds> {
  const { data } = await supabase.from("farm_spray_thresholds").select("*").eq("farm_id", farmId).maybeSingle();
  if (!data) return DEFAULT_THRESHOLDS;
  return {
    wind_min_kmh: data.wind_min_kmh ?? DEFAULT_THRESHOLDS.wind_min_kmh,
    wind_max_kmh: data.wind_max_kmh ?? DEFAULT_THRESHOLDS.wind_max_kmh,
    gust_max_kmh: data.gust_max_kmh ?? DEFAULT_THRESHOLDS.gust_max_kmh,
    humidity_min_pct: data.humidity_min_pct ?? DEFAULT_THRESHOLDS.humidity_min_pct,
    humidity_max_pct: data.humidity_max_pct ?? DEFAULT_THRESHOLDS.humidity_max_pct,
    temp_max_c: data.temp_max_c ?? DEFAULT_THRESHOLDS.temp_max_c,
    delta_t_max: data.delta_t_max ?? DEFAULT_THRESHOLDS.delta_t_max,
    rain_free_hours_after: data.rain_free_hours_after ?? DEFAULT_THRESHOLDS.rain_free_hours_after,
  };
}

export async function saveThresholds(farmId: string, t: SprayThresholds): Promise<void> {
  const businessId = getActiveBusinessId();
  if (!businessId) return;
  const row = { farm_id: farmId, business_id: businessId, ...t, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("farm_spray_thresholds").upsert(row, { onConflict: "farm_id" });
  if (error) console.warn("saveThresholds failed", error);
}

// ─── Confidence label helper ───────────────────────────────────────────────
export function confidenceLabel(pct: number): "High" | "Moderate" | "Low" {
  if (pct >= 75) return "High";
  if (pct >= 55) return "Moderate";
  return "Low";
}


// ─── Accuracy engine ──────────────────────────────────────────────────────
//
// Scores each model's historical performance for a farm by comparing every
// past forecast row we saved to Supabase against ERA5 reanalysis observations
// pulled from Open-Meteo's free archive API. This is the seed of the future
// adaptive weighting layer — for now we just report per-model MAE (mean
// absolute error) so operators can see which model is closest at their place.
//
// Kept intentionally light on cost:
//   • Runs on-demand from a dedicated screen (never on Home).
//   • Pulls at most 30 days of hourly observations per fetch.
//   • Reads forecast_hours filtered to `valid_time < now` and only for the
//     active business — RLS handles the multi-tenant scoping.

export type AccuracyVariable = "temperature_c" | "precip_mm" | "wind_speed_kmh" | "humidity_pct";

export type ModelAccuracy = {
  model: ModelId;
  variable: AccuracyVariable;
  mae: number | null;      // mean absolute error (native units)
  sampleCount: number;
  bias: number | null;     // mean (forecast - observed), positive = model over-predicts
};

export type FarmAccuracyReport = {
  farmId: string;
  farmName?: string;
  sinceDays: number;
  hoursScored: number;
  perModel: ModelAccuracy[];
  bestByVariable: Record<AccuracyVariable, ModelId | null>;
  computedAt: string;
};

const ACCURACY_VARS: AccuracyVariable[] = ["temperature_c", "precip_mm", "wind_speed_kmh", "humidity_pct"];

// Open-Meteo archive variable names (ERA5). Kept identical to VAR_MAP where possible.
const ARCHIVE_VAR: Record<AccuracyVariable, string> = {
  temperature_c: "temperature_2m",
  precip_mm: "precipitation",
  wind_speed_kmh: "wind_speed_10m",
  humidity_pct: "relative_humidity_2m",
};

async function fetchArchiveObservations(lat: number, lon: number, startISO: string, endISO: string): Promise<Map<string, Record<AccuracyVariable, number>>> {
  // ERA5 has a ~5-day publication lag — clip endISO to yesterday so we don't
  // waste a query on unavailable hours.
  const yday = new Date(Date.now() - 24 * 3600_000).toISOString().slice(0, 10);
  const end = endISO > yday ? yday : endISO;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startISO}&end_date=${end}` +
    `&hourly=${Object.values(ARCHIVE_VAR).join(",")}` +
    `&wind_speed_unit=kmh&timezone=auto`;
  const out = new Map<string, Record<AccuracyVariable, number>>();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return out;
    const j = await r.json();
    const times: string[] = j?.hourly?.time ?? [];
    for (let i = 0; i < times.length; i++) {
      const bucket: Record<AccuracyVariable, number> = {} as any;
      let any = false;
      for (const v of ACCURACY_VARS) {
        const arr = j?.hourly?.[ARCHIVE_VAR[v]];
        if (Array.isArray(arr) && typeof arr[i] === "number") {
          bucket[v] = arr[i];
          any = true;
        }
      }
      if (any) out.set(times[i], bucket);
    }
  } catch (e) {
    console.warn("archive obs fetch failed", e);
  }
  return out;
}

export async function computeFarmAccuracy(farmId: string, farmName?: string, sinceDays: number = 14): Promise<FarmAccuracyReport | null> {
  const businessId = getActiveBusinessId();
  if (!businessId) return null;
  const nowMs = Date.now();
  const since = new Date(nowMs - sinceDays * 24 * 3600_000).toISOString();
  const now = new Date(nowMs).toISOString();

  // Pull all past forecast rows for locations under this farm.
  const { data: locs, error: locErr } = await supabase
    .from("weather_locations")
    .select("id, lat, lon")
    .eq("business_id", businessId)
    .eq("farm_id", farmId);
  if (locErr || !locs || locs.length === 0) {
    return { farmId, farmName, sinceDays, hoursScored: 0, perModel: [], bestByVariable: emptyBest(), computedAt: now };
  }

  // For each location, fetch hourly forecasts (valid in the past window) and
  // the matching ERA5 observations. Group errors by model + variable.
  const errorsByModelVar = new Map<string, { sumAbs: number; sumSigned: number; n: number }>(); // key `${model}::${variable}`
  let hoursScored = 0;

  for (const loc of locs) {
    // Pull past forecasts for this location (paginated to stay under 1000-row limit).
    const { data: rows, error } = await supabase
      .from("weather_forecast_hours")
      .select("model, valid_time, temperature_c, precip_mm, wind_speed_kmh, humidity_pct")
      .eq("business_id", businessId)
      .eq("location_id", loc.id)
      .lt("valid_time", now)
      .gt("valid_time", since)
      .order("valid_time", { ascending: true })
      .limit(1000);
    if (error || !rows || rows.length === 0) continue;

    const obs = await fetchArchiveObservations(loc.lat, loc.lon, since.slice(0, 10), now.slice(0, 10));
    if (obs.size === 0) continue;

    for (const row of rows) {
      // Match hourly bucket — ERA5 keys are `YYYY-MM-DDTHH:00`
      const iso = new Date(row.valid_time).toISOString().slice(0, 13) + ":00";
      const b = obs.get(iso);
      if (!b) continue;
      hoursScored += 1;
      for (const v of ACCURACY_VARS) {
        const forecast = (row as any)[v];
        const observed = b[v];
        if (typeof forecast !== "number" || typeof observed !== "number") continue;
        const key = `${row.model}::${v}`;
        const bucket = errorsByModelVar.get(key) ?? { sumAbs: 0, sumSigned: 0, n: 0 };
        bucket.sumAbs += Math.abs(forecast - observed);
        bucket.sumSigned += forecast - observed;
        bucket.n += 1;
        errorsByModelVar.set(key, bucket);
      }
    }
  }

  const perModel: ModelAccuracy[] = [];
  const models: ModelId[] = ["ecmwf_ifs025", "ecmwf_aifs025_single", "bom_access_global", "gfs_seamless", "dwd_icon_global", "meteofrance_arpege_world"];
  for (const m of models) {
    for (const v of ACCURACY_VARS) {
      const b = errorsByModelVar.get(`${m}::${v}`);
      perModel.push({
        model: m,
        variable: v,
        mae: b && b.n > 0 ? b.sumAbs / b.n : null,
        bias: b && b.n > 0 ? b.sumSigned / b.n : null,
        sampleCount: b?.n ?? 0,
      });
    }
  }

  const bestByVariable = emptyBest();
  for (const v of ACCURACY_VARS) {
    const rows = perModel.filter((r) => r.variable === v && r.mae != null);
    if (rows.length === 0) continue;
    rows.sort((a, b) => (a.mae ?? Infinity) - (b.mae ?? Infinity));
    bestByVariable[v] = rows[0].model;
  }

  return { farmId, farmName, sinceDays, hoursScored, perModel, bestByVariable, computedAt: now };
}

function emptyBest(): Record<AccuracyVariable, ModelId | null> {
  return { temperature_c: null, precip_mm: null, wind_speed_kmh: null, humidity_pct: null };
}

export function variableLabel(v: AccuracyVariable): string {
  return v === "temperature_c" ? "Temperature (°C)"
    : v === "precip_mm" ? "Rainfall (mm)"
    : v === "wind_speed_kmh" ? "Wind (km/h)"
    : "Humidity (%)";
}
