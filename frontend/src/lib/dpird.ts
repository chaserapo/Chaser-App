// Nearest DPIRD weather station reading (WA only), via the Chaser backend's
// /api/dpird/nearest. The backend holds the DPIRD key and caches readings, so
// the app never calls DPIRD directly. Returns null outside WA, when no open
// station is within 30 km, or on any failure - it's a bonus, never a blocker.

export type DpirdReading = {
  at: string; // ISO time the 15-minute reading ended
  temp_c: number | null;
  rh: number | null;
  delta_t: number | null;
  wind_kmh: number | null; // 10 m average
  gust_kmh: number | null; // 10 m max
  wind_dir: string;
  wind_height_m: number | null;
  wind3_kmh: number | null; // 3 m average, where the station has it
};

export type DpirdStation = { code: string; name: string; km: number };

export async function fetchNearestDpird(lat: number, lon: number): Promise<{ station: DpirdStation; reading: DpirdReading } | null> {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/dpird/nearest?lat=${lat}&lon=${lon}`, { signal: controller.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.station && json?.reading ? { station: json.station, reading: json.reading } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function formatReadingTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
