// Free geocoding via OpenStreetMap Nominatim (no API key required).
//
// Chaser uses this to drop a "pin" at a farm's address so the Weather
// tab / Paddocks map can show its rough location before any paddock
// boundary has been drawn. Nominatim's usage policy asks for:
//   - 1 request per second per client
//   - a descriptive User-Agent
//
// We keep the surface tiny and cheap — one lookup per address the farmer
// types, plus a short in-memory cache to dedupe accidental double taps.

const cache = new Map<string, { lat: number; lon: number; label: string } | null>();

export type Geocoded = { lat: number; lon: number; label: string };

export async function geocodeAddress(input: string, opts?: { country?: string }): Promise<Geocoded | null> {
  const q = (input || "").trim();
  if (q.length < 3) return null;
  const key = `${opts?.country ?? "au"}::${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "0",
    limit: "1",
    countrycodes: opts?.country ?? "au",
  });
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim asks for a descriptive UA. This is a browser-safe header.
        "Accept-Language": "en-AU",
      },
    });
    clearTimeout(timer);
    if (!r.ok) { cache.set(key, null); return null; }
    const arr = await r.json();
    if (!Array.isArray(arr) || arr.length === 0) { cache.set(key, null); return null; }
    const hit = arr[0];
    const out: Geocoded = {
      lat: parseFloat(hit.lat),
      lon: parseFloat(hit.lon),
      label: hit.display_name || q,
    };
    if (!isFinite(out.lat) || !isFinite(out.lon)) { cache.set(key, null); return null; }
    cache.set(key, out);
    return out;
  } catch {
    cache.set(key, null);
    return null;
  }
}
