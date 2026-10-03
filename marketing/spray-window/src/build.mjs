// Builds the static Spray Window site into dist/.
//
//   node src/build.mjs            live forecast from Open-Meteo
//   node src/build.mjs --fixture  synthetic data, for local previews only

import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TOWNS, STATES, nearbyTowns } from "./towns.mjs";
import { fetchForecasts, fixtureForecasts } from "./forecast.mjs";
import { rateHours, summariseDay } from "./conditions.mjs";
import { renderTown, renderState, renderIndex, renderSitemap } from "./render.mjs";
import { CONFIG } from "./config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const fixture = process.argv.includes("--fixture");

async function write(rel, content) {
  const file = join(DIST, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

const forecasts = fixture ? fixtureForecasts(TOWNS) : await fetchForecasts(TOWNS);

const results = TOWNS.map((town) => {
  const f = forecasts.get(town.slug + town.state);
  const rated = rateHours(f.hours, f.sun);
  return { town, today: summariseDay(rated, f.days[0]), tomorrow: summariseDay(rated, f.days[1]) };
});
const byKey = new Map(results.map((r) => [r.town.slug + r.town.state, r]));

const updated = new Date().toLocaleString("en-AU", {
  timeZone: "Australia/Sydney",
  dateStyle: "medium",
  timeStyle: "short",
}) + " AEST/AEDT";
const date = results[0].today.date;

await rm(DIST, { recursive: true, force: true });
await cp(join(ROOT, "static"), join(DIST, "static"), { recursive: true });

const paths = [""];
for (const r of results) {
  const nearby = nearbyTowns(r.town).map((n) => ({ ...n, day: byKey.get(n.town.slug + n.town.state).today }));
  await write(`${r.town.path}index.html`, renderTown({ ...r, nearby, updated }));
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
await write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${CONFIG.siteUrl}/sitemap.xml\n`);
await write(".nojekyll", "");
if (process.env.CUSTOM_DOMAIN) await write("CNAME", `${process.env.CUSTOM_DOMAIN}\n`);

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
console.log(`Built ${paths.length} pages for ${date}${fixture ? " (FIXTURE DATA)" : ""}:`, counts);
