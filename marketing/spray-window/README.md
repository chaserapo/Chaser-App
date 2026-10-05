# Spray Window

A free daily "Can I spray today?" forecast site that markets Chaser. It runs itself:

- **SEO pages.** One page per farming town (173 to start, 99 of them in WA) titled "Can I spray in Dubbo today?". Each shows hourly Delta T, wind, gusts, rain and inversion risk, plus FAQ structured data, nearby-town links, a nozzle-selection section that pitches Chaser's Nozzle Selector (with advice keyed to that day's forecast) and a Chaser download call-to-action. Pages are rebuilt twice a day, so search engines see fresh content.
- **Social cards.** Each morning there's a 1080×1350 card per state and a caption. Captions are written by Claude when `ANTHROPIC_API_KEY` is set and fall back to a template otherwise.
- **Auto-posting.** The morning run posts all state cards to the Chaser Facebook Page when `FB_PAGE_ID` / `FB_PAGE_TOKEN` are set.
- **Post kit.** `<site>/social/` holds every card and caption with copy and download buttons, for sharing in farming Facebook groups. The Graph API can't post to groups.

Spray ratings use the same thresholds as Chaser's `DEFAULT_THRESHOLDS` (`frontend/src/lib/weather-intel.ts`) and the same Delta T formula (`frontend/src/lib/calculators.ts`). On top of those, the site flags likely inversions: within 1h of sunrise or sunset, wind under 11 km/h and cloud under 40%.

## Run locally

```bash
cd marketing/spray-window
npm install
npm run build            # live forecasts (needs internet access to Open-Meteo)
npm run build:fixture    # synthetic data, watermarked "SAMPLE DATA"
npm run social           # cards + captions into dist/social
npm run preview          # http://localhost:8080/spray/
```

## Go live

The site is served at `chaserag.com.au/spray`. The GitHub Action deploys it to its own Vercel project, `chaser-spray-window`, and the Chaser website (`chaserapo/Chaser-website`, also on Vercel) proxies `/spray/*` to that project. See the website's `frontend/vercel.json`.

1. **Vercel token.** In Vercel, go to Account Settings → Tokens and create one. Add it to this repo as the secret `VERCEL_TOKEN` (Settings → Secrets and variables → Actions). The first deploy creates the `chaser-spray-window` project. If the project should belong to a Vercel team, also set the variable `VERCEL_SCOPE` to the team's slug.
2. **Repository variables** (all optional):
   - `SITE_URL`: defaults to `https://chaserag.com.au/spray`. Change it if the site is on another domain.
   - `BASE_PATH`: defaults to `spray`.
   - `APP_STORE_URL` / `PLAY_STORE_URL`: store links. Play defaults to the `au.com.chaserag.chaser` listing. The iOS button is hidden until `APP_STORE_URL` is set.
   - `CHASER_SITE_URL`: the main Chaser site, used for the header and footer links.
3. **Secrets:**
   - `OPEN_METEO_API_KEY`: **required before launch**. Open-Meteo's free API is non-commercial only, and this site promotes a paid app.
   - `DPIRD_API_KEY`: adds live readings from the nearest DPIRD weather station (within 30 km) to WA town pages: Delta T, temperature, humidity, and wind at 10 m and 3 m. Without it, or if DPIRD is down, pages build without them.
   - `ANTHROPIC_API_KEY`: turns on AI-written captions.
   - `FB_PAGE_ID`, `FB_PAGE_TOKEN`: a long-lived Page token with `pages_manage_posts`.
4. **Run it once by hand.** Go to Actions → "Spray Window" → Run workflow. Check the project's address in Vercel: if it isn't `chaser-spray-window.vercel.app`, update the three `/spray` rewrites in the website's `frontend/vercel.json` to match.
5. **Keep the Vercel project off git.** It's deployed only by the Action. The repo-root `vercel.json` sets `git.deploymentEnabled: false` so pushes to this repo never trigger a Vercel build. In the project's Settings → Deployment Protection, keep Vercel Authentication off, or the `/spray` proxy gets a login page.
6. **Search engines.** Submit `<SITE_URL>/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

All app links carry `utm_source=spraywindow`, with a `utm_campaign` per placement, so installs can be attributed.

## Adding towns

Append to `src/towns.mjs` (`[name, state, lat, lon]`), then run `npm run check-towns` (or a manual run of the workflow) to confirm the coordinates against a geocoder. Each new town becomes a new page, which means another search query the site can rank for.

## Legal

Pages describe forecast conditions only and carry a disclaimer. They never say a spray is safe. Have the same solicitor reviewing the app's Terms check the disclaimer in `src/render.mjs`.
