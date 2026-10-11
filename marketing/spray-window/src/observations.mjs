// Live readings from DPIRD's WA weather station network (Weather 2.0 API),
// shown on WA town pages beside the forecast. Needs DPIRD_API_KEY; without it,
// or if DPIRD is unreachable, the site builds without observations.
//
// Endpoints and response shapes follow the rOpenSci weatherOz client, which
// wraps the same API. Wind speeds are km/h.

const BASE = "https://api.agric.wa.gov.au/v2/weather/stations";
const MAX_STATION_KM = 30;
const MAX_AGE_HOURS = 6;

function km(a, b) {
  const R = 6371;
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function get(path, params, key) {
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, api_key: key })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) return res.json();
    // 429: the API allows 10 requests a second, so back off and retry.
    if (attempt >= 3 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`DPIRD ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

const perthDate = (d) => d.toLocaleDateString("en-CA", { timeZone: "Australia/Perth" });

// Latest 15-minute summary for one station, or null.
async function latestReading(code, key, now) {
  const json = await get(
    "summaries/15min",
    {
      stationCode: code,
      // Yesterday to tomorrow (Perth dates), so there's data just after midnight too.
      startDateTime: perthDate(new Date(now.getTime() - 86400e3)),
      endDateTime: perthDate(new Date(now.getTime() + 86400e3)),
      interval: "15min",
      select: "stationCode,stationName,period,airTemperature,relativeHumidity,deltaT,wind",
      group: "all",
      includeClosed: "false",
      limit: "300",
      offset: "0",
    },
    key,
  );
  const rows = (json.collection?.[0]?.summaries ?? []).filter((s) => s.airTemperature?.avg != null);
  const last = rows[rows.length - 1];
  if (!last) return null;
  const at = new Date(last.period.to);
  if (now - at > MAX_AGE_HOURS * 3600e3) return null;
  const wind = (h) => last.wind?.find((w) => w.height === h);
  const w10 = wind(10) ?? last.wind?.[last.wind.length - 1];
  const w3 = wind(3);
  return {
    at: at.toISOString(),
    temp_c: last.airTemperature.avg,
    rh: last.relativeHumidity?.avg ?? null,
    delta_t: last.deltaT?.avg ?? null,
    wind_kmh: w10?.avg?.speed ?? null,
    gust_kmh: w10?.max?.speed ?? null,
    wind_dir: w10?.avg?.direction?.compassPoint ?? "",
    wind_height_m: w10?.height ?? null,
    wind3_kmh: w3 && w3 !== w10 ? w3.avg?.speed ?? null : null,
  };
}

// Returns Map<townKey, {station, km, reading}> for WA towns with a nearby
// open station that reported in the last few hours.
export async function fetchObservations(towns, { now = new Date() } = {}) {
  const key = process.env.DPIRD_API_KEY;
  const out = new Map();
  if (!key) return out;
  const wa = towns.filter((t) => t.state === "WA");
  if (!wa.length) return out;

  const list = await get(
    "",
    { select: "stationCode,stationName,latitude,longitude,status", group: "api", includeClosed: "false", limit: "300", offset: "0" },
    key,
  );
  const stations = (list.collection ?? [])
    .filter((s) => s.status === "open" && s.latitude != null && s.longitude != null)
    .map((s) => ({ code: s.stationCode, name: s.stationName, lat: s.latitude, lon: s.longitude }));

  const nearest = new Map();
  for (const t of wa) {
    const best = stations.map((s) => ({ s, d: km(t, s) })).sort((a, b) => a.d - b.d)[0];
    if (best && best.d <= MAX_STATION_KM) nearest.set(t.slug + t.state, best);
  }

  const readings = new Map();
  for (const code of new Set([...nearest.values()].map((n) => n.s.code))) {
    try {
      readings.set(code, await latestReading(code, key, now));
    } catch (err) {
      console.warn(`DPIRD ${code}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 150)); // stay under 10 requests/second
  }

  for (const [k, { s, d }] of nearest) {
    const reading = readings.get(s.code);
    if (reading) out.set(k, { station: s.name, km: d, reading });
  }
  return out;
}

// Plausible readings for --fixture previews. Never used by the scheduled build.
export function fixtureObservations(towns) {
  const out = new Map();
  towns
    .filter((t) => t.state === "WA")
    .forEach((t, i) => {
      if (i % 4 === 3) return; // some towns have no station nearby
      out.set(t.slug + t.state, {
        station: `${t.name} (sample)`,
        km: (i % 5) * 4 + 2,
        reading: {
          at: new Date(Date.now() - ((i % 3) + 1) * 15 * 60e3).toISOString(),
          temp_c: 18 + (i % 7),
          rh: 55 - (i % 9) * 2,
          delta_t: 3 + (i % 6) * 0.9,
          wind_kmh: 6 + (i % 8) * 1.5,
          gust_kmh: 12 + (i % 8) * 2,
          wind_dir: ["SW", "S", "SE", "W", "NW"][i % 5],
          wind_height_m: 10,
          wind3_kmh: 3 + (i % 8),
        },
      });
    });
  return out;
}
