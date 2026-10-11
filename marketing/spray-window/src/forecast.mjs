// Pulls a 2-day hourly forecast for every town from Open-Meteo in batches.
//
// Open-Meteo's free endpoint is for non-commercial use. This site markets a
// paid app, so set OPEN_METEO_API_KEY (a commercial subscription) to switch to
// the customer endpoint before going live.

const HOURLY = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "precipitation",
  "precipitation_probability",
  "cloud_cover",
].join(",");

const BATCH = 50;

function toTownForecast(raw) {
  const h = raw.hourly;
  const hours = h.time.map((time, i) => ({
    time,
    temp_c: h.temperature_2m[i],
    rh: h.relative_humidity_2m[i],
    wind_kmh: h.wind_speed_10m[i],
    gust_kmh: h.wind_gusts_10m[i],
    wind_dir_deg: h.wind_direction_10m[i],
    precip_mm: h.precipitation[i],
    precip_prob: h.precipitation_probability[i],
    cloud_pct: h.cloud_cover[i],
  }));
  const sun = {};
  raw.daily.time.forEach((d, i) => {
    sun[d] = { sunrise: raw.daily.sunrise[i], sunset: raw.daily.sunset[i] };
  });
  return { timezone: raw.timezone, days: raw.daily.time, hours, sun };
}

async function fetchBatch(towns) {
  const key = process.env.OPEN_METEO_API_KEY;
  const base = key ? "https://customer-api.open-meteo.com/v1/forecast" : "https://api.open-meteo.com/v1/forecast";
  const params = new URLSearchParams({
    latitude: towns.map((t) => t.lat).join(","),
    longitude: towns.map((t) => t.lon).join(","),
    hourly: HOURLY,
    daily: "sunrise,sunset",
    wind_speed_unit: "kmh",
    timezone: "auto",
    forecast_days: "2",
  });
  if (key) params.set("apikey", key);

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const json = await res.json();
      return Array.isArray(json) ? json : [json];
    }
    if (attempt >= 4) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

export async function fetchForecasts(towns) {
  const out = new Map();
  for (let i = 0; i < towns.length; i += BATCH) {
    const chunk = towns.slice(i, i + BATCH);
    const results = await fetchBatch(chunk);
    chunk.forEach((t, j) => out.set(t.slug + t.state, toTownForecast(results[j])));
  }
  return out;
}

// Synthetic forecasts for local previews when Open-Meteo is unreachable.
// Never used by the scheduled build.
export function fixtureForecasts(towns, startDate = new Date().toISOString().slice(0, 10)) {
  const out = new Map();
  const d0 = new Date(`${startDate}T00:00:00Z`);
  const days = [0, 1].map((n) => new Date(d0.getTime() + n * 86400e3).toISOString().slice(0, 10));
  towns.forEach((t, idx) => {
    let seed = idx * 9301 + 49297;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const windBase = 4 + rand() * 12;
    const wet = rand() < 0.15;
    const hours = [];
    for (const d of days) {
      for (let hr = 0; hr < 24; hr++) {
        const diurnal = Math.sin(((hr - 9) / 24) * 2 * Math.PI);
        const temp = 16 + 9 * diurnal + rand() * 2;
        hours.push({
          time: `${d}T${String(hr).padStart(2, "0")}:00`,
          temp_c: +temp.toFixed(1),
          rh: Math.round(Math.min(98, 70 - 25 * diurnal + rand() * 8)),
          wind_kmh: +(windBase * (0.4 + 0.8 * Math.max(0, diurnal + 0.3)) + rand() * 3).toFixed(1),
          gust_kmh: +(windBase * 1.5 * (0.4 + 0.8 * Math.max(0, diurnal + 0.3)) + rand() * 5).toFixed(1),
          wind_dir_deg: Math.round(rand() * 360),
          precip_mm: wet && hr > 14 && hr < 19 ? 1.2 : 0,
          precip_prob: wet && hr > 12 ? 60 : Math.round(rand() * 15),
          cloud_pct: Math.round(rand() * 60),
        });
      }
    }
    const sun = Object.fromEntries(days.map((d) => [d, { sunrise: `${d}T06:00`, sunset: `${d}T18:45` }]));
    out.set(t.slug + t.state, { timezone: "Australia/Sydney", days, hours, sun });
  });
  return out;
}
