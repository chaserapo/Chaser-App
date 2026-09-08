import * as Location from "expo-location";
import { deltaT } from "./calculators";

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

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=auto`;
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
