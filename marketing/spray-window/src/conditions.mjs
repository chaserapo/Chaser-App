// Spray-condition rating. Thresholds mirror Chaser's DEFAULT_THRESHOLDS in
// frontend/src/lib/weather-intel.ts and the Delta T formula in
// frontend/src/lib/calculators.ts, so the public site and the app agree.

export const THRESHOLDS = {
  wind_min_kmh: 3,
  wind_max_kmh: 15,
  wind_marginal_kmh: 11,
  gust_max_kmh: 20,
  gust_marginal_kmh: 15,
  temp_max_c: 30,
  delta_t_max: 10,
  delta_t_marginal: 8,
  delta_t_min: 2,
  rain_prob_max: 40,
  rain_prob_marginal: 20,
  rain_mm_max: 0.2,
  rain_free_hours_after: 4,
  inversion_wind_kmh: 11,
  inversion_cloud_pct: 40,
};

// Same Stull (2011) wet-bulb approximation as the app.
export function deltaT(temp_c, rh) {
  if (temp_c == null || rh == null || isNaN(temp_c) || isNaN(rh)) return null;
  const T = temp_c;
  const RH = Math.max(0, Math.min(100, rh));
  const Tw =
    T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
    Math.atan(T + RH) -
    Math.atan(RH - 1.676331) +
    0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
    4.686035;
  return Number((T - Tw).toFixed(1));
}

export function degToCompass(deg) {
  if (deg == null) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

const minutesOf = (iso) => {
  const [h, m] = iso.slice(11, 16).split(":").map(Number);
  return h * 60 + m;
};

// Rate every hour. `hours` are local-time rows; `sun` maps YYYY-MM-DD to
// {sunrise, sunset} local ISO strings.
export function rateHours(hours, sun, t = THRESHOLDS) {
  return hours.map((h, i) => {
    const dt = deltaT(h.temp_c, h.rh);
    const day = h.time.slice(0, 10);
    const s = sun[day];
    const min = minutesOf(h.time);
    const nearNight = s
      ? min < minutesOf(s.sunrise) + 60 || min >= minutesOf(s.sunset) - 60
      : false;
    const inversion =
      nearNight &&
      (h.wind_kmh ?? 99) < t.inversion_wind_kmh &&
      (h.cloud_pct ?? 100) < t.inversion_cloud_pct;
    const rainSoon = hours
      .slice(i + 1, i + 1 + t.rain_free_hours_after)
      .some((x) => (x.precip_mm ?? 0) > t.rain_mm_max);

    const no = [];
    const marginal = [];
    if ((h.precip_mm ?? 0) > t.rain_mm_max || (h.precip_prob ?? 0) > t.rain_prob_max) no.push("Rain");
    if ((h.wind_kmh ?? 0) > t.wind_max_kmh) no.push("Too windy");
    else if ((h.wind_kmh ?? 0) < t.wind_min_kmh) no.push("Wind too light");
    if ((h.gust_kmh ?? 0) > t.gust_max_kmh) no.push("Gusty");
    if ((h.temp_c ?? 0) > t.temp_max_c) no.push("Too hot");
    if (dt != null && dt > t.delta_t_max) no.push("Delta T high");
    if (inversion) no.push("Inversion risk");

    if (dt != null && dt > t.delta_t_marginal && dt <= t.delta_t_max) marginal.push("Delta T 8–10");
    if (dt != null && dt < t.delta_t_min) marginal.push("Delta T low");
    if ((h.wind_kmh ?? 0) > t.wind_marginal_kmh && (h.wind_kmh ?? 0) <= t.wind_max_kmh) marginal.push("Breezy");
    if ((h.gust_kmh ?? 0) > t.gust_marginal_kmh && (h.gust_kmh ?? 0) <= t.gust_max_kmh) marginal.push("Gusts");
    if ((h.precip_prob ?? 0) > t.rain_prob_marginal && (h.precip_prob ?? 0) <= t.rain_prob_max) marginal.push("Rain chance");
    if (rainSoon) marginal.push("Rain within 4h");

    const status = no.length ? "no" : marginal.length ? "marginal" : "good";
    return {
      ...h,
      delta_t: dt,
      wind_dir: degToCompass(h.wind_dir_deg),
      inversion,
      status,
      reasons: no.length ? no : marginal,
    };
  });
}

// Summarise one local day between 5am and 9pm. `fromHour` is the town's
// current local hour ("YYYY-MM-DDTHH:00"): earlier hours stay in `hours`
// (flagged `past`, for the table and strip) but don't count towards the
// verdict, window or reasons.
export function summariseDay(rated, date, fromHour = null) {
  const hrs = rated
    .filter((h) => h.time.startsWith(date) && minutesOf(h.time) >= 5 * 60 && minutesOf(h.time) <= 21 * 60)
    .map((h) => ({ ...h, past: fromHour != null && h.time < fromHour }));
  const ahead = hrs.filter((h) => !h.past);

  // Longest run of usable (good or marginal) hours, ranked by good-hour count.
  let best = null;
  let cur = [];
  const flush = () => {
    if (cur.length >= 2) {
      const good = cur.filter((h) => h.status === "good").length;
      if (!best || good > best.good || (good === best.good && cur.length > best.hours.length)) {
        best = { hours: cur, good };
      }
    }
    cur = [];
  };
  for (const h of ahead) {
    if (h.status !== "no") cur.push(h);
    else flush();
  }
  flush();

  let verdict = "unfavourable";
  if (best && best.good >= 3) verdict = "favourable";
  else if (best) verdict = "marginal";

  // Most common blocking reason, to explain a poor day.
  const counts = {};
  for (const h of ahead) for (const r of h.reasons) counts[r] = (counts[r] ?? 0) + 1;
  const topReasons = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => r);

  const window = best
    ? (() => {
        const w = best.hours;
        const range = (k) => {
          const v = w.map((h) => h[k]).filter((x) => x != null);
          return v.length ? [Math.min(...v), Math.max(...v)] : null;
        };
        const end = new Date(`${w[w.length - 1].time}:00Z`);
        end.setUTCHours(end.getUTCHours() + 1);
        return {
          start: w[0].time,
          end: end.toISOString().slice(0, 16),
          hours: w.length,
          good_hours: best.good,
          delta_t: range("delta_t"),
          wind: range("wind_kmh"),
          gust_max: Math.max(...w.map((h) => h.gust_kmh ?? 0)),
          temp: range("temp_c"),
        };
      })()
    : null;

  return {
    date,
    verdict,
    window,
    topReasons,
    hours: hrs,
    partial: ahead.length < hrs.length, // some of the day has already gone
    over: hrs.length > 0 && ahead.length === 0,
  };
}

export function fmtHour(iso) {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

export function fmtDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function windowText(w) {
  return w ? `${fmtHour(w.start)}–${fmtHour(w.end)}` : "No window";
}

export const VERDICT_LABEL = {
  favourable: "Favourable",
  marginal: "Marginal",
  unfavourable: "Unfavourable",
};
