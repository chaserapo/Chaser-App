// Builds the static Spray Window site into dist/ (or dist/<BASE_PATH>/).
//
//   node src/build.mjs            live forecast from Open-Meteo
//   node src/build.mjs --fixture  synthetic data, for local previews only

import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOWNS, STATES, nearbyTowns } from "./towns.mjs";
import { fetchForecasts, fixtureForecasts } from "./forecast.mjs";
import { fetchObservations, fixtureObservations } from "./observations.mjs";
import { rateHours, summariseDay, THRESHOLDS } from "./conditions.mjs";
import { renderTown, renderState, renderIndex, renderSitemap } from "./render.mjs";
import { CONFIG, BASE_PATH, siteDir } from "./config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const SITE = siteDir(DIST);
const fixture = process.argv.includes("--fixture");

async function write(rel, content) {
  const file = join(SITE, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

const forecasts = fixture ? fixtureForecasts(TOWNS) : await fetchForecasts(TOWNS);
// Station readings are a bonus: a DPIRD outage must never stop the build.
const observations = fixture
  ? fixtureObservations(TOWNS)
  : await fetchObservations(TOWNS).catch((err) => {
      console.warn(`DPIRD observations skipped: ${err.message}`);
      return new Map();
    });

// The town's current local hour, e.g. "2026-10-05T10:00", so "today" only
// counts the hours still to come (matters for the midday rebuild).
const NOW = new Date();
function localHour(timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(NOW)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

const results = TOWNS.map((town) => {
  const f = forecasts.get(town.slug + town.state);
  const rated = rateHours(f.hours, f.sun);
  const from = localHour(f.timezone || "Australia/Sydney");
  return { town, today: summariseDay(rated, f.days[0], from), tomorrow: summariseDay(rated, f.days[1], from) };
});
const byKey = new Map(results.map((r) => [r.town.slug + r.town.state, r]));

// --- Calibration diagnostics (temporary) -----------------------------------
// Logs why hours are marked down, and tomorrow's verdicts under a candidate
// threshold set, so the rating can be tuned against real forecasts.
{
  const CANDIDATE = { ...THRESHOLDS, wind_max_kmh: 20, wind_marginal_kmh: 15, gust_max_kmh: 30, gust_marginal_kmh: 25 };
  const reasons = {};
  const verdicts = { current: {}, candidate: {} };
  let hours = 0;
  for (const town of TOWNS) {
    const f = forecasts.get(town.slug + town.state);
    for (const [name, t] of [["current", THRESHOLDS], ["candidate", CANDIDATE]]) {
      const day = summariseDay(rateHours(f.hours, f.sun, t), f.days[1]);
      verdicts[name][day.verdict] = (verdicts[name][day.verdict] ?? 0) + 1;
      if (name === "current") {
        for (const h of day.hours) {
          hours++;
          for (const r of h.reasons) reasons[`${h.status}:${r}`] = (reasons[`${h.status}:${r}`] ?? 0) + 1;
        }
      }
    }
  }
  console.log(`Calibration, tomorrow 5am-9pm, ${hours} town-hours. Reasons (status:reason count):`);
  console.log(Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" | "));
  console.log("Calibration, tomorrow verdicts current:", verdicts.current, "candidate:", verdicts.candidate);
}

const updated = new Date().toLocaleString("en-AU", {
  timeZone: "Australia/Sydney",
  dateStyle: "medium",
  timeStyle: "short",
}) + " AEST/AEDT";
const date = results[0].today.date;

await rm(DIST, { recursive: true, force: true });
await cp(join(ROOT, "static"), join(SITE, "static"), { recursive: true });

const paths = [""];
for (const r of results) {
  const nearby = nearbyTowns(r.town).map((n) => ({ ...n, day: byKey.get(n.town.slug + n.town.state).today }));
  await write(`${r.town.path}index.html`, renderTown({ ...r, nearby, updated, obs: observations.get(r.town.slug + r.town.state) }));
  paths.push(r.town.path);
}

const byState = {};
for (const st of Object.keys(STATES)) {
  byState[st] = results.filter((r) => r.town.state === st).sort((a, b) => a.town.name.localeCompare(b.town.name));
  await write(`${st.toLowerCase()}/index.html`, renderState({ state: st, rows: byState[st], updated, date }));
  paths.push(`${st.toLowerCase()}/`);
}

await write("index.html", renderIndex({ byState, updated, date }));
await write("sitemap.xml", renderSitemap(paths));
// Domain-level files always go at the top of dist/, whatever BASE_PATH is.
const writeRoot = async (rel, content) => writeFile(join(DIST, rel), content);
await writeRoot("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n`);
// Vercel: every page is a folder index, so always use trailing-slash URLs
// (keeps the pages' relative links correct).
await writeRoot("vercel.json", JSON.stringify({ trailingSlash: true }, null, 2) + "\n");
// Until the main Chaser site is built into dist/, send the bare domain to Spray Window.
if (BASE_PATH) {
  await writeRoot(
    "index.html",
    `<!doctype html><meta charset="utf-8"><title>Chaser</title><meta http-equiv="refresh" content="0; url=/${BASE_PATH}/"><link rel="canonical" href="${CONFIG.siteUrl}/"><a href="/${BASE_PATH}/">Spray Window by Chaser</a>\n`,
  );
}

// Compact summary consumed by the social-card step.
await write(
  "data/today.json",
  JSON.stringify(
    {
      date,
      updated,
      fixture,
      towns: results.map(({ town, today }) => ({
        name: town.name,
        state: town.state,
        path: town.path,
        verdict: today.verdict,
        window: today.window,
        topReasons: today.topReasons,
      })),
    },
    null,
    2,
  ),
);

const counts = results.reduce((a, r) => ((a[r.today.verdict] = (a[r.today.verdict] ?? 0) + 1), a), {});
console.log(`DPIRD station readings: ${observations.size} WA towns`);
console.log(`Built ${paths.length} pages for ${date}${fixture ? " (FIXTURE DATA)" : ""}:`, counts);
