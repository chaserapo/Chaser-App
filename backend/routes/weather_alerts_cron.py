"""
Chaser weather alerts — backend scheduled push notifier.

Every N hours (default 2, override via env WEATHER_ALERTS_CRON_HOURS) this
task evaluates each enabled weather_alerts row against a fresh Open-Meteo
forecast for the relevant farm and pushes an Expo notification the first
time a condition is met, using notification_log (the same table
alerts_cron.py uses) so a given condition only ever fires once.

Forecasts are fetched live rather than read from whatever weather_cron.py
last stored: a user turning an alert on shouldn't have to wait for the next
weather_cron tick, and a farm nobody has opened the Weather tab for yet
still needs to be evaluated.

Five alert kinds, each checked against the farm's saved spray thresholds
(farm_spray_thresholds, falling back to the app's defaults):
  spray_window      - a window matching the farm's thresholds opens in the
                       next 36h (same window-finding logic as the app).
  frost             - overnight low <= 0C within the next 48h.
  wind_max          - forecast wind exceeds the farm's max within 24h.
  rain_change       - forecast rainfall for today/tomorrow lands in a
                       meaningfully different bucket than last time this
                       alert fired for that date.
  rain_after_spray  - a spray job finished in the last 24h and rain is now
                       forecast before its rain-free window is up.

Kept dependency-light like the other two crons: httpx + os + asyncio.

Note: this REQUIRES the Supabase service_role key. If it's not configured,
the task logs a warning and stays idle so the app still works.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from routes.weather_fetch import MODELS, fetch_model

logger = logging.getLogger("chaser.weather_alerts")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Mirrors DEFAULT_THRESHOLDS in frontend/src/lib/weather-intel.ts.
DEFAULT_THRESHOLDS: Dict[str, float] = {
    "wind_min_kmh": 3,
    "wind_max_kmh": 15,
    "gust_max_kmh": 20,
    "humidity_min_pct": 40,
    "humidity_max_pct": 95,
    "temp_max_c": 30,
    "delta_t_max": 10,
    "rain_free_hours_after": 4,
}

# Fixed, arbitrary namespace for deriving stable notification_log ref_ids
# from human-readable strings (notification_log.ref_id is a uuid column).
_REF_NAMESPACE = uuid.UUID("6f3b6f2e-2f0a-4c8b-9a3e-2b6f7a1c9d10")


def _ref_id(*parts: str) -> str:
    return str(uuid.uuid5(_REF_NAMESPACE, ":".join(parts)))


def _cron_hours() -> int:
    try:
        return max(1, int(os.getenv("WEATHER_ALERTS_CRON_HOURS", "2")))
    except ValueError:
        return 2


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


async def _sb_insert_new(client: httpx.AsyncClient, conf: Dict[str, str], path: str, rows: List[Dict[str, Any]], on_conflict: str) -> Any:
    """Bulk insert, silently dropping rows that violate the on_conflict unique
    constraint. Returns only the rows that were newly inserted — this is what
    turns "condition still true every tick" into "alert once"."""
    if not rows:
        return []
    r = await client.post(
        f"{conf['url']}/rest/v1/{path}",
        params={"on_conflict": on_conflict},
        json=rows,
        headers={
            "apikey": conf["key"],
            "Authorization": f"Bearer {conf['key']}",
            "Content-Type": "application/json",
            "Prefer": "return=representation,resolution=ignore-duplicates",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


async def _send_push(client: httpx.AsyncClient, messages: List[Dict[str, Any]]) -> None:
    for i in range(0, len(messages), 90):
        chunk = messages[i : i + 90]
        try:
            r = await client.post(
                EXPO_PUSH_URL, json=chunk,
                headers={"Content-Type": "application/json", "Accept": "application/json"}, timeout=20,
            )
            r.raise_for_status()
        except Exception as e:  # pragma: no cover — a bad token shouldn't crash the run
            logger.warning("weather alerts cron: push send failed for a batch: %s", e)


# ─── Forecast helpers ───────────────────────────────────────────────────────
def _consensus(by_model: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Simple mean-across-models per hour — enough for threshold checks;
    the app's own confidence scoring isn't needed just to decide to alert."""
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for hours in by_model.values():
        for h in hours:
            buckets.setdefault(h["valid_time"], []).append(h)
    out: List[Dict[str, Any]] = []
    for vt in sorted(buckets.keys()):
        rows = buckets[vt]

        def avg(key: str) -> Optional[float]:
            vals = [r[key] for r in rows if r.get(key) is not None]
            return sum(vals) / len(vals) if vals else None

        out.append({
            "valid_time": vt,
            "wind_speed_kmh": avg("wind_speed_kmh"),
            "wind_gust_kmh": avg("wind_gust_kmh"),
            "humidity_pct": avg("humidity_pct"),
            "temperature_c": avg("temperature_c"),
            "precip_prob": avg("precip_prob"),
            "precip_mm": avg("precip_mm"),
        })
    return out


def _find_spray_windows(hours: List[Dict[str, Any]], t: Dict[str, float], now: datetime, horizon_h: int = 36) -> List[Dict[str, Any]]:
    def ok(h: Dict[str, Any]) -> bool:
        w = h.get("wind_speed_kmh")
        if w is None or w < t["wind_min_kmh"] or w > t["wind_max_kmh"]:
            return False
        g = h.get("wind_gust_kmh")
        if g is not None and g > t["gust_max_kmh"]:
            return False
        hu = h.get("humidity_pct")
        if hu is not None and (hu < t["humidity_min_pct"] or hu > t["humidity_max_pct"]):
            return False
        tc = h.get("temperature_c")
        if tc is not None and tc > t["temp_max_c"]:
            return False
        pp = h.get("precip_prob")
        if pp is not None and pp > 40:
            return False
        pm = h.get("precip_mm")
        if pm is not None and pm > 0.2:
            return False
        return True

    cutoff = now + timedelta(hours=horizon_h)
    windows: List[Dict[str, Any]] = []
    cur: List[Dict[str, Any]] = []

    def flush() -> None:
        nonlocal cur
        if len(cur) >= 2:
            windows.append({"start": cur[0]["valid_time"], "end": cur[-1]["valid_time"], "hours": len(cur)})
        cur = []

    for h in hours:
        vt = datetime.fromisoformat(h["valid_time"])
        if vt < now - timedelta(hours=1) or vt > cutoff:
            continue
        if ok(h):
            cur.append(h)
        else:
            flush()
    flush()
    return windows


def _coldest_next48(hours: List[Dict[str, Any]], now: datetime) -> Optional[Dict[str, Any]]:
    coldest: Optional[Dict[str, Any]] = None
    for h in hours:
        vt = datetime.fromisoformat(h["valid_time"])
        if vt < now or vt > now + timedelta(hours=48):
            continue
        tc = h.get("temperature_c")
        if tc is not None and (coldest is None or tc < coldest["temperature_c"]):
            coldest = h
    return coldest


def _first_wind_exceed_next24(hours: List[Dict[str, Any]], now: datetime, max_kmh: float) -> Optional[Dict[str, Any]]:
    for h in hours:
        vt = datetime.fromisoformat(h["valid_time"])
        if vt < now or vt > now + timedelta(hours=24):
            continue
        w = h.get("wind_speed_kmh")
        if w is not None and w > max_kmh:
            return h
    return None


def _daily_precip(hours: List[Dict[str, Any]], date_str: str) -> "tuple[Optional[float], Optional[float]]":
    total = 0.0
    prob = 0.0
    found = False
    for h in hours:
        if h["valid_time"][:10] != date_str:
            continue
        found = True
        if h.get("precip_mm") is not None:
            total += h["precip_mm"]
        if h.get("precip_prob") is not None:
            prob = max(prob, h["precip_prob"])
    return (round(total, 1), round(prob)) if found else (None, None)


# ─── Main tick ──────────────────────────────────────────────────────────────
async def _cron_tick() -> None:
    conf = _supabase_conf()
    if not conf:
        logger.warning("weather alerts cron: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping tick")
        return
    async with httpx.AsyncClient() as client:
        alerts = await _sb_get(client, conf, "weather_alerts", {
            "select": "id,business_id,user_id,farm_id,kind",
            "enabled": "eq.true",
        }) or []
        if not alerts:
            logger.info("weather alerts cron: no enabled alerts")
            return

        farms = await _sb_get(client, conf, "farms", {
            "select": "id,business_id,name",
            "deleted_at": "is.null",
            "archived_at": "is.null",
        }) or []
        farms_by_id = {f["id"]: f for f in farms}
        farm_ids_by_business: Dict[str, List[str]] = {}
        for f in farms:
            farm_ids_by_business.setdefault(f["business_id"], []).append(f["id"])

        locations = await _sb_get(client, conf, "weather_locations", {
            "select": "id,business_id,farm_id,lat,lon",
            "paddock_id": "is.null",
        }) or []
        location_by_farm = {l["farm_id"]: l for l in locations if l.get("farm_id")}

        threshold_rows = await _sb_get(client, conf, "farm_spray_thresholds", {"select": "*"}) or []
        thresholds_by_farm = {r["farm_id"]: r for r in threshold_rows}

        token_rows = await _sb_get(client, conf, "push_tokens", {"select": "user_id,token"}) or []
        tokens_by_user: Dict[str, List[str]] = {}
        for r in token_rows:
            tokens_by_user.setdefault(r["user_id"], []).append(r["token"])

        def farm_targets(alert: Dict[str, Any]) -> List[str]:
            if alert.get("farm_id"):
                return [alert["farm_id"]]
            return farm_ids_by_business.get(alert["business_id"], [])

        now = datetime.now(timezone.utc)

        farms_needed = {fid for a in alerts for fid in farm_targets(a) if fid}
        consensus_by_farm: Dict[str, List[Dict[str, Any]]] = {}
        utc_offset_by_farm: Dict[str, int] = {}
        for farm_id in farms_needed:
            loc = location_by_farm.get(farm_id)
            if not loc:
                continue
            tasks = [fetch_model(client, m, float(loc["lat"]), float(loc["lon"]), days=3) for m in MODELS]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            by_model: Dict[str, List[Dict[str, Any]]] = {}
            for m, r in zip(MODELS, results):
                if isinstance(r, Exception):
                    logger.warning("weather alerts cron: model %s failed for farm %s: %s", m, farm_id, r)
                    continue
                if r and r.get("rows"):
                    by_model[m] = r["rows"]
                    utc_offset_by_farm.setdefault(farm_id, r.get("utc_offset_seconds") or 0)
            if by_model:
                consensus_by_farm[farm_id] = _consensus(by_model)

        # Spray jobs completed recently, for rain_after_spray.
        lookback_date = (now - timedelta(hours=30)).strftime("%Y-%m-%d")
        recent_jobs = await _sb_get(client, conf, "spray_jobs", {
            "select": "id,business_id,farm_id,date,finish_time",
            "status": "eq.completed",
            "deleted_at": "is.null",
            "date": f"gte.{lookback_date}",
        }) or []

        # ref_id -> {business_id, kind, tokens, title, body, data}
        entries: Dict[str, Dict[str, Any]] = {}

        def add(ref: str, business_id: str, log_kind: str, tokens: List[str], title: str, body: str, data: Dict[str, Any]) -> None:
            entries[ref] = {"business_id": business_id, "kind": log_kind, "tokens": tokens, "title": title, "body": body, "data": data}

        for a in alerts:
            kind = a["kind"]
            tokens = tokens_by_user.get(a["user_id"]) or []
            if not tokens:
                continue
            for farm_id in farm_targets(a):
                hours = consensus_by_farm.get(farm_id)
                if not hours:
                    continue
                farm_name = (farms_by_id.get(farm_id) or {}).get("name") or "Your farm"
                t = dict(DEFAULT_THRESHOLDS)
                t.update({k: v for k, v in (thresholds_by_farm.get(farm_id) or {}).items() if v is not None})

                if kind == "spray_window":
                    for w in _find_spray_windows(hours, t, now):
                        ref = _ref_id("spray_window", a["id"], farm_id, w["start"])
                        start_h = w["start"][11:16]
                        add(ref, a["business_id"], "wx_spray_window", tokens,
                            "Spray window opening",
                            f"{farm_name}: good conditions from {start_h} for about {w['hours']}h.",
                            {"type": "spray_window", "farmId": farm_id})

                elif kind == "frost":
                    coldest = _coldest_next48(hours, now)
                    if coldest and coldest.get("temperature_c") is not None and coldest["temperature_c"] <= 0:
                        date = coldest["valid_time"][:10]
                        ref = _ref_id("frost", a["id"], farm_id, date)
                        add(ref, a["business_id"], "wx_frost", tokens,
                            "Frost risk",
                            f"{farm_name}: overnight low near/below freezing around {date}.",
                            {"type": "frost", "farmId": farm_id})

                elif kind == "wind_max":
                    hit = _first_wind_exceed_next24(hours, now, t["wind_max_kmh"])
                    if hit:
                        date = hit["valid_time"][:10]
                        ref = _ref_id("wind_max", a["id"], farm_id, date)
                        add(ref, a["business_id"], "wx_wind_max", tokens,
                            "Wind exceeds your threshold",
                            f"{farm_name}: forecast wind above {t['wind_max_kmh']:.0f} km/h expected {date}.",
                            {"type": "wind_max", "farmId": farm_id})

                elif kind == "rain_change":
                    for offset in (0, 1):
                        date = (now + timedelta(days=offset)).strftime("%Y-%m-%d")
                        total, prob = _daily_precip(hours, date)
                        if total is None or (total < 1 and (prob or 0) < 30):
                            continue
                        bucket = f"{round(total)}mm_{round((prob or 0) / 10) * 10}pct"
                        ref = _ref_id("rain_change", a["id"], farm_id, date, bucket)
                        add(ref, a["business_id"], "wx_rain_change", tokens,
                            "Rain forecast changed",
                            f"{farm_name}: {date} now shows {total:.0f}mm ({(prob or 0):.0f}% chance).",
                            {"type": "rain_change", "farmId": farm_id})

                elif kind == "rain_after_spray":
                    hours_after = t["rain_free_hours_after"]
                    offset = utc_offset_by_farm.get(farm_id, 0)
                    for job in recent_jobs:
                        if job.get("farm_id") != farm_id or not job.get("finish_time") or not job.get("date"):
                            continue
                        try:
                            # date + finish_time are the farm's local wall clock (same
                            # convention as Open-Meteo's timezone=auto hourly times) -
                            # convert with the farm's own UTC offset so it lines up
                            # with `valid_time`, which fetch_model already corrected.
                            finish_naive = datetime.fromisoformat(f"{job['date']}T{job['finish_time']}:00")
                        except Exception:
                            continue
                        finish = finish_naive.replace(tzinfo=timezone.utc) - timedelta(seconds=offset)
                        window_end = finish + timedelta(hours=hours_after)
                        if now >= window_end or now < finish - timedelta(hours=1):
                            continue
                        risk = False
                        for h in hours:
                            vt = datetime.fromisoformat(h["valid_time"])
                            if vt < finish or vt > window_end:
                                continue
                            if (h.get("precip_prob") or 0) > 40 or (h.get("precip_mm") or 0) > 0.2:
                                risk = True
                                break
                        if risk:
                            ref = _ref_id("rain_after_spray", job["id"])
                            add(ref, a["business_id"], "wx_rain_after_spray", tokens,
                                "Rain risk after your spray job",
                                f"{farm_name}: rain now forecast within your {hours_after:.0f}h rain-free window.",
                                {"type": "rain_after_spray", "farmId": farm_id, "jobId": job["id"]})

        if not entries:
            logger.info("weather alerts cron: nothing new to alert on")
            return

        log_rows = [{"business_id": e["business_id"], "kind": e["kind"], "ref_id": ref} for ref, e in entries.items()]
        new_rows = await _sb_insert_new(client, conf, "notification_log", log_rows, on_conflict="kind,ref_id")
        new_refs = {r["ref_id"] for r in (new_rows or [])}

        messages: List[Dict[str, Any]] = []
        for ref in new_refs:
            e = entries.get(ref)
            if not e:
                continue
            for tok in e["tokens"]:
                messages.append({"to": tok, "title": e["title"], "body": e["body"], "data": e["data"]})

        if messages:
            await _send_push(client, messages)
        logger.info("weather alerts cron: %d new alert(s), %d push message(s) sent", len(new_refs), len(messages))


async def weather_alerts_cron_loop() -> None:
    """Background loop — runs forever, sleeps between ticks."""
    hours = _cron_hours()
    logger.info("weather alerts cron: starting (every %sh)", hours)
    # Initial short delay so app boot isn't blocked.
    await asyncio.sleep(120)
    while True:
        try:
            await _cron_tick()
        except Exception as e:  # pragma: no cover
            logger.exception("weather alerts cron tick raised: %s", e)
        await asyncio.sleep(hours * 3600)
