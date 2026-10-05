import { CONFIG, withUtm } from "./config.mjs";
import { STATES } from "./towns.mjs";
import { VERDICT_LABEL, fmtDate, fmtHour, windowText } from "./conditions.mjs";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r1 = (n) => (n == null ? "–" : Math.round(n));
const range = (r, unit = "") => (r ? (Math.round(r[0]) === Math.round(r[1]) ? `${Math.round(r[0])}${unit}` : `${Math.round(r[0])}–${Math.round(r[1])}${unit}`) : "–");
const rangeDt = (r) => (r ? `${r[0].toFixed(1)}–${r[1].toFixed(1)}` : "–");

export const DISCLAIMER =
  "Spray Window is a forecast-based guide only, generated automatically from public weather model data for the town centre. Conditions in your paddock can differ. It is not agronomic advice and does not tell you a spray is safe, effective or legal. Always follow the registered product label, APVMA and state requirements, and check actual on-site conditions (including Delta T, wind and inversions) before and during application.";

function layout({ title, description, path, body, jsonLd = [], updated, depth }) {
  const root = depth === 0 ? "./" : "../".repeat(depth);
  const url = `${CONFIG.siteUrl}/${path}`;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(CONFIG.siteName)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(CONFIG.siteUrl)}/static/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${root}static/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${root}static/style.css">
${jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="${root}"><img src="${root}static/chaser-icon.png" alt="" width="32" height="32">Spray Window</a>
  <a class="btn" href="${esc(primaryAppUrl("header"))}">Get Chaser</a>
</div></header>
<main><div class="wrap">
${body}
<p class="disclaimer">${esc(DISCLAIMER)}${updated ? ` Forecast updated ${esc(updated)}.` : ""}</p>
</div></main>
<footer class="site"><div class="wrap">
  Spray Window is a free tool from <a href="${esc(primaryAppUrl("footer"))}">Chaser</a>, the spray record and farm operations app for Australian growers and contractors. Weather data: <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0). WA station readings: <a href="https://www.dpird.wa.gov.au/online-tools/apis/">DPIRD</a>, Department of Primary Industries and Regional Development, Western Australia.
</div></footer>
</body>
</html>`;
}

function primaryAppUrl(campaign) {
  return withUtm(CONFIG.appSiteUrl || CONFIG.playStoreUrl || CONFIG.appStoreUrl, campaign);
}

function ctaBlock(townName) {
  const links = [];
  if (CONFIG.appStoreUrl) links.push(`<a class="btn" href="${esc(withUtm(CONFIG.appStoreUrl, "town-cta"))}">Download for iPhone</a>`);
  if (CONFIG.playStoreUrl) links.push(`<a class="btn${links.length ? " secondary" : ""}" href="${esc(withUtm(CONFIG.playStoreUrl, "town-cta"))}">Get it on Android</a>`);
  return `<section class="cta">
  <h2>Spraying${townName ? ` around ${esc(townName)}` : ""}? Keep the record in Chaser.</h2>
  <p>Chaser captures temperature, humidity, Delta T, wind and GPS when you start a spray job, so your records are done before you leave the paddock. It also handles tank-mix calculators, your chemical register and machinery servicing. Works offline in the cab.</p>
  <div class="actions">${links.join("")}</div>
  <p class="muted" style="color:inherit;opacity:.8;margin-bottom:0">7-day free trial.</p>
</section>`;
}

// Nozzle selection: what Chaser's Nozzle Selector (frontend/app/calculators/
// nozzle-guide.tsx) does, plus a nudge tied to today's forecast.
function nozzleAdvice(day) {
  const w = day.window;
  if (!w) return "There is no usable window today, which makes it a good day to check your nozzle setup before the next one.";
  const dtMax = w.delta_t ? w.delta_t[1] : 0;
  const windMax = w.wind ? w.wind[1] : 0;
  if (dtMax > 8)
    return `Delta T reaches ${dtMax.toFixed(1)} in today's window. Fine droplets evaporate fast in those conditions, and many labels require a coarse or larger spray quality above Delta T 8.`;
  if (windMax > 11)
    return `Wind gets up to ${Math.round(windMax)} km/h in today's window. A coarser spray quality, such as an air-induction nozzle, holds droplets on target better when it's breezy.`;
  return "Today's window is mild, so this is the time to match spray quality to the product rather than to the weather. Contact products and fungicides usually want better coverage than systemic herbicides.";
}

function nozzleBlock(day) {
  return `<section class="card nozzle">
  <h2>Right conditions, wrong nozzle?</h2>
  <p>Good weather only gets you halfway. The nozzle sets droplet size, and droplet size decides how much reaches the target and how much drifts. Too fine and it evaporates or drifts off the paddock. Too coarse and coverage suffers, especially with contact products. Nozzles also only work properly within their pressure range, so changing speed or water rate can push your current set out of it.</p>
  ${day ? `<p class="callout">${esc(nozzleAdvice(day))}</p>` : ""}
  <h3>How Chaser helps</h3>
  <ul>
    <li><b>Nozzle Selector.</b> Enter water rate, travel speed and nozzle spacing. Chaser works out the flow each nozzle needs and recommends matching nozzles from TeeJet, Lechler, Hardi, Hypro and ARAG, with the pressure each will run at.</li>
    <li><b>Matched to the job.</b> Choose systemic or contact herbicide, fungicide, insecticide, drift control or liquid fertiliser. It also handles PWM sprayers and spot spraying.</li>
    <li><b>Catches a bad match.</b> It flags any nozzle that would run under or over its recommended pressure range at your settings.</li>
    <li><b>On the record.</b> Each sprayer keeps its nozzle spacing and default nozzle, and the nozzle used is saved with every spray job.</li>
  </ul>
  <p class="muted">Example: 80 L/ha at 18 km/h on 50 cm spacing needs 1.2 L/min per nozzle. That's an 03 (blue) at about 3.1 bar. Always check the spray quality required on the product label.</p>
</section>`;
}

function hourTable(day) {
  const rows = day.hours
    .map(
      (h) => `<tr${h.past ? ' class="past"' : ""}>
<td>${fmtHour(h.time)}</td>
<td><span class="pill ${h.status}">${h.status === "good" ? "Good" : h.status === "marginal" ? "Marginal" : "Poor"}</span></td>
<td>${h.delta_t == null ? "–" : h.delta_t.toFixed(1)}</td>
<td>${r1(h.wind_kmh)} ${esc(h.wind_dir)}</td>
<td>${r1(h.gust_kmh)}</td>
<td>${r1(h.temp_c)}°</td>
<td>${r1(h.rh)}%</td>
<td>${r1(h.precip_prob)}%</td>
<td class="reasons">${esc(h.reasons.join(", "))}</td>
</tr>`,
    )
    .join("");
  return `<div class="table-scroll"><table>
<thead><tr><th>Time</th><th>Conditions</th><th>Delta T</th><th>Wind km/h</th><th>Gust</th><th>Temp</th><th>RH</th><th>Rain</th><th>Notes</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function strip(day) {
  return `<div class="strip" aria-hidden="true">${day.hours.map((h) => `<div class="${h.status}${h.past ? " past" : ""}" title="${fmtHour(h.time)}: ${h.past ? "passed" : h.status}"></div>`).join("")}</div>
<div class="strip-labels"><span>5am</span><span>9am</span><span>1pm</span><span>5pm</span><span>9pm</span></div>`;
}

export function verdictSentence(town, day) {
  const w = day.window;
  if (day.over) return `Today's 5am–9pm spray hours in ${town.name} are over. See tomorrow's forecast.`;
  if (day.verdict === "favourable")
    return `Forecast spray conditions in ${town.name} are favourable from ${windowText(w)}, with Delta T ${rangeDt(w.delta_t)} and wind ${range(w.wind, " km/h")}.`;
  if (day.verdict === "marginal")
    return `Spray conditions in ${town.name} are marginal. The best window is ${windowText(w)} (Delta T ${rangeDt(w.delta_t)}, wind ${range(w.wind, " km/h")}).`;
  return `Forecast spray conditions in ${town.name} are unfavourable today${day.topReasons.length ? ` (${day.topReasons.join(", ").toLowerCase()})` : ""}.`;
}

function dayCard(label, town, day) {
  const w = day.window;
  return `<div class="card">
  <div class="muted">${esc(day.partial && !day.over ? "Rest of today" : label)} · ${esc(fmtDate(day.date))}</div>
  <div class="big">${w ? esc(windowText(w)) : day.over ? "Day's spray hours are over" : day.partial ? "No window left today" : "No spray window"}</div>
  <span class="pill ${day.verdict}">${VERDICT_LABEL[day.verdict]}</span>
  ${
    w
      ? `<div class="stats"><span>Delta T <b>${rangeDt(w.delta_t)}</b></span><span>Wind <b>${range(w.wind, " km/h")}</b></span><span>Gusts to <b>${Math.round(w.gust_max)}</b></span><span>Temp <b>${range(w.temp, "°")}</b></span></div>`
      : `<div class="stats"><span>Main issues: <b>${esc(day.topReasons.join(", ") || "–")}</b></span></div>`
  }
  ${strip(day)}
</div>`;
}

// Live DPIRD station reading (WA only). Measured, so it says so plainly.
function observationBlock(obs) {
  if (!obs) return "";
  const r = obs.reading;
  const time = new Date(r.at).toLocaleTimeString("en-AU", { timeZone: "Australia/Perth", hour: "numeric", minute: "2-digit" });
  const n = (v, d = 0) => (v == null ? "–" : Number(v).toFixed(d));
  const dtNote =
    r.delta_t == null ? "" : r.delta_t > 10 ? "above 10" : r.delta_t > 8 ? "in the 8–10 marginal range" : r.delta_t < 2 ? "below 2" : "in the 2–8 range";
  return `<section class="card obs">
  <div class="muted">Measured at ${esc(time)} (Perth time) · DPIRD ${esc(obs.station)} station, ${Math.round(obs.km)} km away</div>
  <div class="stats obs-stats">
    <span>Delta T <b>${n(r.delta_t, 1)}</b></span>
    <span>Wind <b>${n(r.wind_kmh)} km/h ${esc(r.wind_dir)}</b>${r.wind_height_m ? ` <span class="muted">at ${r.wind_height_m} m</span>` : ""}</span>
    <span>Gusts <b>${n(r.gust_kmh)}</b></span>
    ${r.wind3_kmh != null ? `<span>Wind at 3 m <b>${n(r.wind3_kmh)} km/h</b></span>` : ""}
    <span>Temp <b>${n(r.temp_c)}°</b></span>
    <span>RH <b>${n(r.rh)}%</b></span>
  </div>
  ${dtNote ? `<p class="muted" style="margin:8px 0 0">Measured Delta T is ${dtNote}. Conditions in your paddock can still differ, so check on site.</p>` : ""}
</section>`;
}

export function renderTown({ town, today, tomorrow, nearby, updated, obs }) {
  const stateName = STATES[town.state];
  const title = `Can I spray in ${town.name} today? Delta T & spray conditions | Spray Window`;
  const description = `${verdictSentence(town, today)} Hourly Delta T, wind, gusts and inversion risk for ${town.name}, ${town.state}. Updated daily.`;
  const faq = [
    {
      q: `Is today a good day to spray in ${town.name}?`,
      a: verdictSentence(town, today) + " Always check conditions on site.",
    },
    {
      q: "What Delta T is suitable for spraying?",
      a: "Delta T between 2 and 8 is generally considered suitable. 8–10 is marginal and typically needs coarser droplets. Above 10, droplets evaporate quickly and spraying is generally avoided. Below 2 there is a higher risk of drift and inversions. Always follow the product label.",
    },
    {
      q: "What wind speed is right for spraying?",
      a: "Most labels require a steady wind between about 3 and 15–20 km/h blowing away from sensitive areas. Very light or calm wind, especially near dawn and dusk under clear skies, can indicate a surface temperature inversion.",
    },
    {
      q: "How do I choose the right spray nozzle?",
      a: "Work out the flow each nozzle needs from your water rate, travel speed and nozzle spacing (L/ha × km/h × spacing in m ÷ 600 = L/min). Then pick a nozzle that delivers that flow within its recommended pressure range and produces the spray quality your product label requires. Chaser's Nozzle Selector does this calculation and recommends matching nozzles.",
    },
    {
      q: `How is the ${town.name} spray forecast calculated?`,
      a: "Hourly temperature, humidity, wind, gusts, cloud and rain from public weather models for the town centre are rated against common spray thresholds, including Delta T, wind range, gusts, heat, rain and likely inversion periods around sunrise and sunset.",
    },
  ];
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Spray Window", item: `${CONFIG.siteUrl}/` },
        { "@type": "ListItem", position: 2, name: stateName, item: `${CONFIG.siteUrl}/${town.state.toLowerCase()}/` },
        { "@type": "ListItem", position: 3, name: town.name, item: `${CONFIG.siteUrl}/${town.path}` },
      ],
    },
  ];
  const body = `
<div class="crumbs"><a href="../../">Spray Window</a> › <a href="../">${esc(stateName)}</a> › ${esc(town.name)}</div>
<h1>Can I spray in ${esc(town.name)} today?</h1>
<p class="muted">${esc(verdictSentence(town, today))}</p>
<div class="verdict">
${dayCard("Today", town, today)}
${dayCard("Tomorrow", town, tomorrow)}
</div>
${obs ? `<h2>Right now near ${esc(town.name)}</h2>\n${observationBlock(obs)}` : ""}

<h2>Hourly spray conditions today: ${esc(town.name)}, ${esc(town.state)}</h2>
${hourTable(today)}

<h2>Tomorrow</h2>
${hourTable(tomorrow)}

${nozzleBlock(today)}

${ctaBlock(town.name)}

<h2>Nearby towns</h2>
<ul class="grid-links">${nearby
    .map(({ town: t, km, day }) => `<li><a href="../../${t.path}"><span>${esc(t.name)} <span class="muted">${Math.round(km)} km</span></span><span class="pill ${day.verdict}">${VERDICT_LABEL[day.verdict]}</span></a></li>`)
    .join("")}</ul>

<h2>Spraying FAQ</h2>
${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
`;
  return layout({ title, description, path: town.path, body, jsonLd, updated, depth: 2 });
}

function townList(rows, prefix) {
  return `<ul class="grid-links" data-towns>${rows
    .map(
      ({ town, today }) =>
        `<li data-name="${esc(town.name.toLowerCase())}"><a href="${prefix}${town.path}"><span>${esc(town.name)}${prefix === "./" ? ` <span class="muted">${town.state}</span>` : ""}<br><span class="muted">${esc(windowText(today.window))}</span></span><span class="pill ${today.verdict}">${VERDICT_LABEL[today.verdict]}</span></a></li>`,
    )
    .join("")}</ul>`;
}

const SEARCH_JS = `<script>
document.querySelector('.search').addEventListener('input', function (e) {
  var q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('[data-towns] li').forEach(function (li) {
    li.style.display = !q || li.dataset.name.indexOf(q) !== -1 ? '' : 'none';
  });
});
</script>`;

export function renderState({ state, rows, updated, date }) {
  const name = STATES[state];
  const fav = rows.filter((r) => r.today.verdict === "favourable").length;
  const body = `
<div class="crumbs"><a href="../">Spray Window</a> › ${esc(name)}</div>
<h1>Spray conditions today: ${esc(name)}</h1>
<p class="muted">${esc(fmtDate(date))}. ${fav} of ${rows.length} ${esc(state)} towns have a favourable spray window today. Pick a town for hourly Delta T, wind and inversion risk.</p>
<input class="search" type="search" placeholder="Find a town…" aria-label="Find a town">
<div style="margin-top:12px">${townList(rows, "../")}</div>
${ctaBlock("")}
${SEARCH_JS}`;
  return layout({
    title: `Spray conditions today in ${name}: Delta T & spray windows | Spray Window`,
    description: `Today's spray windows for ${rows.length} ${name} farming towns: Delta T, wind, gusts and inversion risk, updated daily. ${fav} towns have favourable conditions.`,
    path: `${state.toLowerCase()}/`,
    body,
    updated,
    depth: 1,
  });
}

export function renderIndex({ byState, updated, date }) {
  const all = Object.values(byState).flat();
  const fav = all.filter((r) => r.today.verdict === "favourable").length;
  const body = `
<h1>Can I spray today?</h1>
<p class="muted">Free daily spray-condition forecasts for ${all.length} Australian farming towns. Each one shows Delta T, wind, gusts, rain and inversion risk hour by hour. ${esc(fmtDate(date))}: ${fav} towns have a favourable window.</p>
<input class="search" type="search" placeholder="Find your nearest town…" aria-label="Find a town">
${Object.entries(byState)
  .map(([st, rows]) => `<h2><a href="./${st.toLowerCase()}/">${esc(STATES[st])}</a></h2>${townList(rows, "./")}`)
  .join("")}
${nozzleBlock(null)}
${ctaBlock("")}
${SEARCH_JS}`;
  return layout({
    title: "Can I spray today? Delta T & spray window forecast for Australian farms | Spray Window",
    description: `Daily spray windows for ${all.length} Australian farming towns: Delta T, wind, gusts, rain and inversion risk by the hour. Free, from the makers of Chaser.`,
    path: "",
    body,
    updated,
    depth: 0,
  });
}

export function renderSitemap(paths) {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${esc(`${CONFIG.siteUrl}/${p}`)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}
</urlset>
`;
}
