// Approximate paddock and farm locations from drawn boundaries. Used for
// weather when the phone has no GPS fix.

import type { Farm, Paddock, PaddockBoundary } from "./types";

export function polygonCentroid(b?: PaddockBoundary | null): { lat: number; lon: number } | null {
  if (!b || b.type !== "Polygon" || !b.coordinates || b.coordinates.length === 0) return null;
  const ring = b.coordinates[0]; // outer ring
  if (!ring || ring.length === 0) return null;
  let sx = 0, sy = 0, n = 0;
  for (const [lng, lat] of ring) {
    if (typeof lng === "number" && typeof lat === "number") { sx += lng; sy += lat; n += 1; }
  }
  if (n === 0) return null;
  const lat = sy / n, lon = sx / n;
  // A boundary saved with garbled/swapped coordinates can centroid outside
  // valid Earth ranges. Treat that the same as "no boundary" instead of
  // handing bogus coordinates to the weather API, which rejects them with a
  // 400 identically across every model (surfacing as "couldn't load the
  // forecast" with no indication the real problem is this paddock's drawn
  // boundary).
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function coordsForPaddock(p: Paddock): { lat: number; lon: number } | null {
  return polygonCentroid(p.boundary ?? null);
}

export function coordsForFarm(farm: Farm, paddocks: Paddock[]): { lat: number; lon: number } | null {
  const own = paddocks.filter((p) => p.farm_id === farm.id).map(coordsForPaddock).filter((c): c is { lat: number; lon: number } => !!c);
  if (own.length === 0) return null;
  const lat = own.reduce((s, c) => s + c.lat, 0) / own.length;
  const lon = own.reduce((s, c) => s + c.lon, 0) / own.length;
  return { lat, lon };
}
