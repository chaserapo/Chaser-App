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

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      lat = loc.coords.latitude;
      lon = loc.coords.longitude;
    }
  } catch {
    // fall through with defaults
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh&timezone=auto`;
  const res = await fetch(url);
  const data = await res.json();
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
