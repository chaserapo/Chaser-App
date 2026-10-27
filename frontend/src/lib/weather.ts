import * as Location from "expo-location";
import { deltaT } from "./calculators";
import { openMeteoUrl } from "./open-meteo";
import type { SprayJob } from "./types";

// Human-readable source of a record's starting weather, for the record screen,
// PDF and CSV. Undefined for records saved before the source was tracked.
export function weatherSourceLabel(j: Pick<SprayJob, "weather_source" | "weather_station">): string | undefined {
  if (j.weather_source === "dpird") return `DPIRD station${j.weather_station ? ` ${j.weather_station}` : ""}`;
  if (j.weather_source === "forecast") return "Forecast (auto-captured)";
  if (j.weather_source === "manual") return "Entered by operator";
  return undefined;
}

export type WeatherSnapshot = {
  temperature_c: number;
  humidity: number;
  delta_t: number;
  wind_speed: number;
  wind_direction: string;
  captured_at: string;
  lat?: number;
  lon?: number;
};

function degToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

export type RainHour = { at: string; mm: number; prob: number | null };

// Hourly rain for the next `hours` hours. Requested in GMT so the timestamps
// can be parsed unambiguously. Returns null when the forecast can't be reached.
export async function fetchRainOutlook(lat: number, lon: number, hours = 24): Promise<RainHour[] | null> {
  const url = openMeteoUrl("api", `/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation,precipitation_probability&forecast_hours=${hours}&timezone=GMT`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const h = (await res.json())?.hourly;
    if (!h?.time) return null;
    return (h.time as string[]).map((t, i) => ({
      at: `${t}:00Z`,
      mm: Number(h.precipitation?.[i] ?? 0),
      prob: h.precipitation_probability?.[i] ?? null,
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Rain counts when at least 0.2 mm is forecast and it's not a long shot.
const RAIN_MM = 0.2;
const RAIN_PROB = 30;
export const DEFAULT_RAINFAST_HOURS = 4;

// First forecast rain within `windowH` hours of now, or null if it looks dry.
export function firstRainWithin(outlook: RainHour[], windowH: number, now = Date.now()): RainHour | null {
  const end = now + windowH * 3600e3;
  for (const r of outlook) {
    const t = new Date(r.at).getTime();
    // An hourly value covers the hour ending at `at`, so include the current hour.
    if (t <= now || t - 3600e3 > end) continue;
    if (r.mm >= RAIN_MM && (r.prob == null || r.prob >= RAIN_PROB)) return r;
  }
  return null;
}

export async function fetchWeather(): Promise<WeatherSnapshot> {
  // Default to Wagga Wagga NSW if permission denied - central AU broadacre location.
  let lat = -35.117;
  let lon = 147.356;

  // Race the location lookup against a short timeout so a stalled GPS prompt
  // (e.g. web headless or a phone with location temporarily unavailable) never
  // traps the caller — the app falls back to the default coordinates cleanly.
  try {
    const perm = await Promise.race([
      Location.requestForegroundPermissionsAsync(),
      new Promise<{ status: "denied" }>((resolve) => setTimeout(() => resolve({ status: "denied" }), 2500)),
    ]);
    if ((perm as any).status === "granted") {
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (loc && (loc as any).coords) {
        lat = (loc as any).coords.latitude;
        lon = (loc as any).coords.longitude;
      }
    }
  } catch {
    // fall through with defaults
  }

  const url = openMeteoUrl("api", `/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=auto`);
  // Time-box the fetch as well so an offline caller doesn't hang forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let data: any = {};
  try {
    const res = await fetch(url, { signal: controller.signal });
    data = await res.json();
  } catch {
    // Return best-effort snapshot with zeros so calc doesn't NaN and the user
    // can enter values manually.
  } finally {
    clearTimeout(timer);
  }
  const c = data.current ?? {};
  const t = Number(c.temperature_2m ?? 0);
  const rh = Number(c.relative_humidity_2m ?? 0);
  const ws = Number(c.wind_speed_10m ?? 0);
  const wd = Number(c.wind_direction_10m ?? 0);

  return {
    temperature_c: t,
    humidity: rh,
    delta_t: deltaT(t, rh),
    wind_speed: ws,
    wind_direction: degToCompass(wd),
    captured_at: new Date().toISOString(),
    lat,
    lon,
  };
}
