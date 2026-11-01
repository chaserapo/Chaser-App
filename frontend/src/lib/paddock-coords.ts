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
  return { lat: sy / n, lon: sx / n };
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
