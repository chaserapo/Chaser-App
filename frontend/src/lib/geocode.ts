// Free, no-API-key geocoding via OpenStreetMap's Nominatim. Used to jump the
// paddock map to a searched place, or to an address already on file (e.g. a
// farm's stored address) without the user having to pan/zoom to find it.

export type GeocodeResult = { lat: number; lon: number };

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "Accept-Language": "en" } },
    );
    const results = await res.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!first) return null;
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}
