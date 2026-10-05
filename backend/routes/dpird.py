"""
Nearest DPIRD weather station reading for a point in WA.

GET /api/dpird/nearest?lat=..&lon=.. returns the latest 15-minute reading from
the nearest open DPIRD station within 30 km, or {"station": null}.

The DPIRD key stays on the server (DPIRD_API_KEY) and responses are cached:
the station list for a day and each station's reading for 10 minutes. DPIRD
allows 10 requests/second and 4,000/hour per key, so app users share a
handful of upstream calls instead of each hitting DPIRD.

Endpoints and response shapes follow the rOpenSci weatherOz client and match
marketing/spray-window/src/observations.mjs. Wind speeds are km/h.
"""
from __future__ import annotations

import asyncio
import math
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/dpird", tags=["dpird"])

BASE = "https://api.agric.wa.gov.au/v2/weather/stations"
MAX_STATION_KM = 30.0
MAX_AGE = timedelta(hours=6)
STATIONS_TTL = 24 * 3600
READING_TTL = 10 * 60
PERTH = timezone(timedelta(hours=8))  # WA has no daylight saving

_stations: Tuple[float, List[Dict[str, Any]]] = (0.0, [])
_readings: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}
_lock = asyncio.Lock()


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = math.radians
    h = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


async def _get(client: httpx.AsyncClient, path: str, params: Dict[str, str], key: str) -> Dict[str, Any]:
    r = await client.get(f"{BASE}/{path}", params={**params, "api_key": key}, timeout=20)
    r.raise_for_status()
    return r.json()


async def _station_list(client: httpx.AsyncClient, key: str) -> List[Dict[str, Any]]:
    global _stations
    fetched, stations = _stations
    if stations and time.time() - fetched < STATIONS_TTL:
        return stations
    data = await _get(
        client,
        "",
        {"select": "stationCode,stationName,latitude,longitude,status", "group": "api",
         "includeClosed": "false", "limit": "300", "offset": "0"},
        key,
    )
    stations = [
        {"code": s["stationCode"], "name": s["stationName"], "lat": s["latitude"], "lon": s["longitude"]}
        for s in data.get("collection") or []
        if s.get("status") == "open" and s.get("latitude") is not None and s.get("longitude") is not None
    ]
    _stations = (time.time(), stations)
    return stations


def _parse_reading(data: Dict[str, Any], now: datetime) -> Optional[Dict[str, Any]]:
    collection = data.get("collection") or []
    rows = [s for s in (collection[0].get("summaries") if collection else None) or []
            if (s.get("airTemperature") or {}).get("avg") is not None]
    if not rows:
        return None
    last = rows[-1]
    at = datetime.fromisoformat(last["period"]["to"].replace("Z", "+00:00"))
    if now - at > MAX_AGE:
        return None
    winds = last.get("wind") or []
    w10 = next((w for w in winds if w.get("height") == 10), winds[-1] if winds else None)
    w3 = next((w for w in winds if w.get("height") == 3), None)
    avg = lambda d, k: (d.get(k) or {}).get("avg") if d else None  # noqa: E731
    return {
        "at": at.isoformat().replace("+00:00", "Z"),
        "temp_c": avg(last, "airTemperature"),
        "rh": avg(last, "relativeHumidity"),
        "delta_t": avg(last, "deltaT"),
        "wind_kmh": ((w10 or {}).get("avg") or {}).get("speed"),
        "gust_kmh": ((w10 or {}).get("max") or {}).get("speed"),
        "wind_dir": (((w10 or {}).get("avg") or {}).get("direction") or {}).get("compassPoint") or "",
        "wind_height_m": (w10 or {}).get("height"),
        "wind3_kmh": ((w3.get("avg") or {}).get("speed")) if w3 and w3 is not w10 else None,
    }


async def _reading(client: httpx.AsyncClient, code: str, key: str) -> Optional[Dict[str, Any]]:
    cached = _readings.get(code)
    if cached and time.time() - cached[0] < READING_TTL:
        return cached[1]
    now = datetime.now(timezone.utc)
    perth_today = now.astimezone(PERTH).date()
    data = await _get(
        client,
        "summaries/15min",
        {"stationCode": code,
         "startDateTime": (perth_today - timedelta(days=1)).isoformat(),
         "endDateTime": (perth_today + timedelta(days=1)).isoformat(),
         "interval": "15min",
         "select": "stationCode,stationName,period,airTemperature,relativeHumidity,deltaT,wind",
         "group": "all", "includeClosed": "false", "limit": "300", "offset": "0"},
        key,
    )
    reading = _parse_reading(data, now)
    _readings[code] = (time.time(), reading)
    return reading


@router.get("/nearest")
async def nearest(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180)):
    key = os.getenv("DPIRD_API_KEY")
    # DPIRD only covers WA; skip the round trip for everywhere else.
    if not key or not (-36.0 <= lat <= -13.0 and 112.0 <= lon <= 129.5):
        return {"station": None}
    try:
        async with _lock:
            async with httpx.AsyncClient() as client:
                stations = await _station_list(client, key)
                ranked = sorted(((_km(lat, lon, s["lat"], s["lon"]), s) for s in stations), key=lambda x: x[0])
                if not ranked or ranked[0][0] > MAX_STATION_KM:
                    return {"station": None}
                km, s = ranked[0]
                reading = await _reading(client, s["code"], key)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"DPIRD unavailable: {e.__class__.__name__}")
    if not reading:
        return {"station": None}
    return {"station": {"code": s["code"], "name": s["name"], "km": round(km, 1)}, "reading": reading}
