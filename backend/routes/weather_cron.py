"""
Chaser Weather Intelligence — backend scheduled fetcher.

Every N hours (default 6, override via env WEATHER_CRON_HOURS) this task:
  1. Reads every active weather_locations row directly from Supabase using
     the service_role key (bypasses RLS on purpose — this is a backend task).
  2. Fetches four independent numeric weather models via Open-Meteo.
  3. Stores one weather_forecast_runs + hourly rows per (location, model).

Runs as an asyncio background task started on app boot. Kept intentionally
dependency-light: `httpx` + `os` + `asyncio` — no APScheduler.

Note: this REQUIRES the Supabase service_role key. If it's not configured,
the task logs a warning and stays idle so the app still works.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from routes.weather_fetch import MODELS, fetch_model

logger = logging.getLogger("chaser.weather")


def _cron_hours() -> int:
    """Configurable frequency — reduce to 24 for cost control."""
    try:
        return max(1, int(os.getenv("WEATHER_CRON_HOURS", "6")))
    except ValueError:
        return 6


def _supabase_conf() -> Optional[Dict[str, str]]:
    url = os.getenv("SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return {"url": url.rstrip("/"), "key": key}


async def _sb_get(client: httpx.AsyncClient, conf: Dict[str, str], path: str, params: Dict[str, Any]) -> Any:
    r = await client.get(
        f"{conf['url']}/rest/v1/{path}",
        params=params,
        headers={"apikey": conf["key"], "Authorization": f"Bearer {conf['key']}"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


async def _sb_post(client: httpx.AsyncClient, conf: Dict[str, str], path: str, body: Any) -> Any:
    r = await client.post(
        f"{conf['url']}/rest/v1/{path}",
        json=body,
        headers={
            "apikey": conf["key"],
            "Authorization": f"Bearer {conf['key']}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        timeout=45,
    )
    r.raise_for_status()
    return r.json()


async def _fetch_and_store_for_location(client: httpx.AsyncClient, conf: Dict[str, str], loc: Dict[str, Any]) -> None:
    lat = float(loc["lat"])
    lon = float(loc["lon"])
    business_id = loc["business_id"]
    location_id = loc["id"]

    # Fetch every model in parallel; skip any that fail so a single model
    # outage doesn't lose the whole run.
    tasks = [fetch_model(client, m, lat, lon) for m in MODELS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    by_model: Dict[str, List[Dict[str, Any]]] = {}
    for m, r in zip(MODELS, results):
        if isinstance(r, Exception):
            logger.warning("weather model %s failed for %s: %s", m, location_id, r)
            continue
        if r and r.get("rows"):
            by_model[m] = r["rows"]
    if not by_model:
        logger.warning("weather cron: no models returned for %s", location_id)
        return

    retrieved_at = datetime.now(timezone.utc).isoformat()
    run = await _sb_post(client, conf, "weather_forecast_runs", {
        "business_id": business_id,
        "location_id": location_id,
        "retrieved_at": retrieved_at,
        "source": "cron",
        "models_requested": MODELS,
        "models_returned": list(by_model.keys()),
        "horizon_hours": 168,
    })
    if not run or not isinstance(run, list):
        logger.warning("weather cron: run insert failed for %s", location_id)
        return
    run_id = run[0]["id"]

    # Flatten hourly rows and chunked-insert to keep individual payloads small.
    rows: List[Dict[str, Any]] = []
    for m, hours in by_model.items():
        for h in hours:
            row = dict(h)
            row["business_id"] = business_id
            row["run_id"] = run_id
            row["location_id"] = location_id
            rows.append(row)
    for i in range(0, len(rows), 400):
        chunk = rows[i : i + 400]
        try:
            await _sb_post(client, conf, "weather_forecast_hours", chunk)
        except Exception as e:  # pragma: no cover — network hiccup
            logger.warning("weather cron: hours chunk insert failed for %s: %s", location_id, e)
            break

    logger.info("weather cron: stored %d hourly rows for %s across %d models", len(rows), location_id, len(by_model))


async def _cron_tick() -> None:
    conf = _supabase_conf()
    if not conf:
        logger.warning("weather cron: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping tick")
        return
    async with httpx.AsyncClient() as client:
        locs = await _sb_get(client, conf, "weather_locations", {"select": "id,business_id,lat,lon,is_active", "is_active": "eq.true"})
        if not isinstance(locs, list) or len(locs) == 0:
            logger.info("weather cron: no active locations")
            return
        logger.info("weather cron: fetching for %d location(s)", len(locs))
        for loc in locs:
            try:
                await _fetch_and_store_for_location(client, conf, loc)
            except Exception as e:  # pragma: no cover
                logger.warning("weather cron: location %s failed: %s", loc.get("id"), e)


async def weather_cron_loop() -> None:
    """Background loop — runs forever, sleeps between ticks."""
    hours = _cron_hours()
    logger.info("weather cron: starting (every %sh)", hours)
    # Initial short delay so app boot isn't blocked.
    await asyncio.sleep(60)
    while True:
        try:
            await _cron_tick()
        except Exception as e:  # pragma: no cover
            logger.exception("weather cron tick raised: %s", e)
        await asyncio.sleep(hours * 3600)
