// Turns dist/data/today.json into daily social posts:
//   dist/social/<state>.png   1080×1350 card (Facebook/Instagram portrait)
//   dist/social/<state>.txt   caption (written by Claude when ANTHROPIC_API_KEY is set)
//   dist/social/index.html    "post kit" page: every card + caption with copy buttons
//   dist/static/og.png        1200×630 link-preview image
//
// Run after build.mjs. Needs Playwright's Chromium.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import Anthropic from "@anthropic-ai/sdk";
import { STATES } from "./towns.mjs";
import { CONFIG, withUtm } from "./config.mjs";
import { VERDICT_LABEL, fmtDate, windowText } from "./conditions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(DIST, "social");

const data = JSON.parse(await readFile(join(DIST, "data/today.json"), "utf8"));
const icon = `data:image/png;base64,${(await readFile(join(ROOT, "static/chaser-icon.png"))).toString("base64")}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const host = CONFIG.siteUrl.replace(/^https?:\/\//, "");
const rank = { favourable: 0, marginal: 1, unfavourable: 2 };

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Plus+Jakarta+Sans:wght@700;800&display=block" rel="stylesheet">`;

const CARD_CSS = `
*{box-sizing:border-box;margin:0}
body{font-family:"Plus Jakarta Sans","Geist",system-ui,sans-serif;background:#0f2e1a;color:#f9fafb}
.card{position:relative;padding:64px 64px 48px;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;gap:16px;font-weight:800;font-size:30px;letter-spacing:.04em;color:#bbf7d0}
.top img{width:56px;height:56px;border-radius:14px}
h1{font-size:64px;line-height:1.05;margin:28px 0 8px;font-weight:800}
.sub{font-size:30px;color:#bbf7d0;margin-bottom:28px}
.rows{display:flex;flex-direction:column;gap:10px;flex:1}
.row{display:flex;align-items:center;justify-content:space-between;background:#163d24;border-radius:16px;padding:14px 22px;font-size:30px}
.row .w{color:#d1fae5;font-size:26px;margin-left:12px}
.pill{border-radius:999px;padding:6px 18px;font-size:24px;font-weight:800}
.favourable{background:#22c55e;color:#052e16}.marginal{background:#fbbf24;color:#422006}.unfavourable{background:#f87171;color:#450a0a}
.foot{margin-top:24px;font-size:28px;color:#d1fae5;display:flex;justify-content:space-between;align-items:flex-end}
.foot b{color:#fff}
.sample{position:absolute;top:40%;left:-10%;width:120%;text-align:center;transform:rotate(-20deg);font-size:120px;font-weight:800;color:rgba(255,255,255,.18)}
`;

function stateCardHtml(state, towns) {
  const sorted = [...towns].sort((a, b) => rank[a.verdict] - rank[b.verdict] || (b.window?.good_hours ?? 0) - (a.window?.good_hours ?? 0));
  const shown = sorted.slice(0, 10);
  const fav = towns.filter((t) => t.verdict === "favourable").length;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${CARD_CSS}.card{width:1080px;height:1350px}</style></head><body><div class="card">
  <div class="top"><img src="${icon}">SPRAY WINDOW · ${esc(state)}</div>
  <h1>Spray conditions today<br>${esc(STATES[state])}</h1>
  <div class="sub">${esc(fmtDate(data.date))} · ${fav} of ${towns.length} towns favourable</div>
  <div class="rows">${shown
    .map((t) => `<div class="row"><span>${esc(t.name)}<span class="w">${esc(windowText(t.window))}</span></span><span class="pill ${t.verdict}">${VERDICT_LABEL[t.verdict]}</span></div>`)
    .join("")}${towns.length > shown.length ? `<div class="sub" style="margin:6px 0 0">+ ${towns.length - shown.length} more towns online</div>` : ""}</div>
  <div class="foot"><span>Hourly Delta T, wind &amp; inversion risk:<br><b>${esc(host)}/${state.toLowerCase()}</b></span><span>Forecast guide only.<br>Check label &amp; site.</span></div>
  ${data.fixture ? '<div class="sample">SAMPLE DATA</div>' : ""}
</div></body></html>`;
}

function ogHtml() {
  const fav = data.towns.filter((t) => t.verdict === "favourable").length;
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${CARD_CSS}.card{width:1200px;height:630px;justify-content:center}</style></head><body><div class="card">
  <div class="top"><img src="${icon}">SPRAY WINDOW BY CHASER</div>
  <h1>Can I spray today?</h1>
  <div class="sub">Daily Delta T, wind and inversion forecasts for ${data.towns.length} Australian farming towns.</div>
  <div class="foot"><b>${esc(host)}</b><span>${fav} favourable today</span></div>
</div></body></html>`;
}

function templateCaption(state, towns) {
  const fav = towns.filter((t) => t.verdict === "favourable");
  const best = [...fav].sort((a, b) => (b.window?.good_hours ?? 0) - (a.window?.good_hours ?? 0)).slice(0, 3);
  const link = stateLink(state);
  const lead = fav.length
    ? `${fav.length} of ${towns.length} ${state} towns have a favourable spray window today. Best looking: ${best.map((t) => `${t.name} (${windowText(t.window)})`).join(", ")}.`
    : `Tough day for spraying across ${STATES[state]}. None of our ${towns.length} towns has a favourable window.`;
  return `${lead}\n\nHourly Delta T, wind, gusts and inversion risk for your town: ${link}\n\nForecast guide only. Always follow the label and check conditions on site.`;
}

let claude = null;
if (process.env.ANTHROPIC_API_KEY) claude = new Anthropic();

const SYSTEM = `You write the daily Facebook post for "Spray Window by Chaser", a free spray-conditions forecast for Australian grain growers and spray contractors.

Write like a practical local agronomist: plain Australian English, specific, no hype, no hashtags, at most one emoji. 350–600 characters.

Use only the forecast data provided. Name 2–4 specific towns and their windows. If conditions are poor, say why (e.g. wind, Delta T, rain).

Never say spraying is "safe" or recommend spraying. Describe forecast conditions only. End with the link exactly as given on its own line, then the line: "Forecast guide only. Always follow the label and check conditions on site."

Output only the post text.`;

const stateLink = (state) => withUtm(`${CONFIG.siteUrl}/${state.toLowerCase()}/`, `social-${state.toLowerCase()}`);
const homeLink = () => withUtm(`${CONFIG.siteUrl}/`, "social-national");

function templateNational() {
  const lines = Object.keys(STATES)
    .map((st) => {
      const towns = data.towns.filter((t) => t.state === st);
      const fav = towns.filter((t) => t.verdict === "favourable").length;
      return towns.length ? `${st}: ${fav} of ${towns.length} towns favourable` : null;
    })
    .filter(Boolean);
  return `Spray conditions for ${fmtDate(data.date)}:\n${lines.join("\n")}\n\nFind your town for hourly Delta T, wind, gusts and inversion risk:\n${homeLink()}\n\nForecast guide only. Always follow the label and check conditions on site.`;
}

async function aiCaption(region, link, towns) {
  const compact = towns.map((t) => ({
    town: t.name,
    state: t.state,
    verdict: t.verdict,
    window: t.window ? windowText(t.window) : null,
    delta_t: t.window?.delta_t,
    wind_kmh: t.window?.wind,
    issues: t.topReasons,
  }));
  const res = await claude.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Region: ${region}\nDate: ${fmtDate(data.date)}\nLink: ${link}\n\nForecast:\n${JSON.stringify(compact)}`,
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("caption request declined");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!text.includes(link)) throw new Error("caption is missing the link");
  return text;
}

async function caption(key, fallback, region, link, towns) {
  let text = fallback;
  if (claude) {
    try {
      text = await aiCaption(region, link, towns);
    } catch (err) {
      console.warn(`${key}: AI caption failed, using template (${err.message})`);
    }
  }
  return data.fixture ? `[SAMPLE DATA, DO NOT POST]\n${text}` : text;
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const shoot = async (html, w, h, file) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  // Fonts are best-effort: fall back to system fonts if Google Fonts is unreachable.
  await page.setContent(html, { waitUntil: "load", timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file });
  await page.close();
};

const posts = [];
for (const state of Object.keys(STATES)) {
  const towns = data.towns.filter((t) => t.state === state);
  if (!towns.length) continue;
  await shoot(stateCardHtml(state, towns), 1080, 1350, join(OUT, `${state.toLowerCase()}.png`));
  const text = await caption(state, templateCaption(state, towns), STATES[state], stateLink(state), towns);
  await writeFile(join(OUT, `${state.toLowerCase()}.txt`), text);
  posts.push({ state, image: `${state.toLowerCase()}.png`, text });
}
await shoot(ogHtml(), 1200, 630, join(DIST, "static/og.png"));
await browser.close();

const national = {
  text: await caption("national", templateNational(), "Australia (all states)", homeLink(), data.towns),
  images: posts.map((p) => p.image),
};
await writeFile(join(OUT, "national.txt"), national.text);
await writeFile(join(OUT, "posts.json"), JSON.stringify({ date: data.date, fixture: data.fixture, national, posts }, null, 2));
await writeFile(
  join(OUT, "index.html"),
  `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Post kit</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:0 auto;padding:16px;background:#f3f4f6;color:#111827}
@media (prefers-color-scheme:dark){body{background:#0b0f14;color:#f3f4f6}}
.post{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:16px;margin:24px 0}
@media (max-width:640px){.post{grid-template-columns:1fr}}
img{width:100%;border-radius:12px}pre{white-space:pre-wrap;font:inherit;margin:0 0 8px}
button,a.b{font:inherit;padding:8px 14px;border-radius:999px;border:0;background:#15803d;color:#fff;cursor:pointer;text-decoration:none;margin-right:6px}</style></head>
<body><h1>Post kit: ${esc(fmtDate(data.date))}</h1>
<p>Save the image, copy the caption, and post it to the matching state's farming groups.${data.fixture ? " <b>SAMPLE DATA. Do not post.</b>" : ""}</p>
<h2>All states (national post)</h2><pre id="cn">${esc(national.text)}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('cn').textContent);this.textContent='Copied'">Copy caption</button>
${posts
  .map(
    (p, i) => `<div class="post"><img src="${p.image}" alt="${esc(STATES[p.state])} spray conditions card"><div><h2>${esc(STATES[p.state])}</h2><pre id="c${i}">${esc(p.text)}</pre>
<button onclick="navigator.clipboard.writeText(document.getElementById('c${i}').textContent);this.textContent='Copied'">Copy caption</button><a class="b" href="${p.image}" download>Download image</a></div></div>`,
  )
  .join("")}
</body></html>`,
);

console.log(`Social cards for ${posts.length} states written to dist/social/${claude ? " (AI captions)" : " (template captions)"}`);
