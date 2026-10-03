// Checks every town's coordinates against Open-Meteo's geocoder and flags any
// that are missing or more than MAX_KM from the matching place in that state.
// Run it after editing towns.mjs:  npm run check-towns
// (The "Spray Window" workflow also runs it on manual runs.)

import { TOWNS, STATES } from "./towns.mjs";

const MAX_KM = 15;

function km(a, b) {
  const R = 6371;
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const annotate = process.env.GITHUB_ACTIONS ? (msg) => console.log(`::warning title=Town location::${msg}`) : (msg) => console.log(`WARN  ${msg}`);

let problems = 0;
for (const town of TOWNS) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(town.name)}&count=10&countryCode=AU&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  const matches = (json.results ?? []).filter((r) => r.admin1 === STATES[town.state]);
  if (!matches.length) {
    annotate(`${town.name}, ${town.state}: no geocoder match; check the name and coordinates by hand`);
    problems++;
    continue;
  }
  const best = matches
    .map((r) => ({ r, d: km(town, { lat: r.latitude, lon: r.longitude }) }))
    .sort((a, b) => a.d - b.d)[0];
  if (best.d > MAX_KM) {
    annotate(`${town.name}, ${town.state}: ${Math.round(best.d)} km from geocoder (${best.r.latitude.toFixed(2)}, ${best.r.longitude.toFixed(2)})`);
    problems++;
  }
  await new Promise((r) => setTimeout(r, 150));
}

console.log(`Checked ${TOWNS.length} towns: ${problems ? `${problems} to review` : "all within " + MAX_KM + " km"}.`);
