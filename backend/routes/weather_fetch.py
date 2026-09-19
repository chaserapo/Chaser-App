"""
Shared Open-Meteo fetch/parse logic for the weather cron jobs
(weather_cron.py and weather_alerts_cron.py) — kept in one place so the two
can't drift apart on the model list, requested variables, or how a
forecast hour's timestamp is turned into an absolute UTC instant.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

import httpx

MODELS: List[str] = ["ecmwf_ifs04", "ecmwf_aifs025", "bom_access_global", "gfs_seamless"]

HOURLY_VARS = ",".join([
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "precipitation_probability",
    "rain",
    "showers",
    "snowfall",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "relative_humidity_2m",
    "dew_point_2m",
    "cloud_cover",
    "surface_pressure",
    "soil_temperature_0cm",
    "soil_moisture_0_to_1cm",
    "et0_fao_evapotranspiration",
])

VAR_MAP = {
    "temperature_2m": "temperature_c",
    "apparent_temperature": "apparent_temp_c",
    "precipitation": "precip_mm",
    "precipitation_probability": "precip_prob",
    "rain": "rain_mm",
    "showers": "showers_mm",
    "snowfall": "snowfall_cm",
    "wind_speed_10m": "wind_speed_kmh",
    "wind_gusts_10m": "wind_gust_kmh",
    "wind_direction_10m": "wind_dir_deg",
    "relative_humidity_2m": "humidity_pct",
    "dew_point_2m": "dew_point_c",
    "cloud_cover": "cloud_cover_pct",
    "surface_pressure": "pressure_hpa",
    "soil_temperature_0cm": "soil_temp_c",
    "soil_moisture_0_to_1cm": "soil_moisture",
    "et0_fao_evapotranspiration": "et0_mm",
}


async def fetch_model(client: httpx.AsyncClient, model: str, lat: float, lon: float, days: int = 7) -> Dict[str, Any]:
    """One model's hourly forecast, with `valid_time` as a true UTC instant.

    Open-Meteo's `timezone=auto` returns hourly timestamps as the location's
    own local wall-clock time with no offset in the string (e.g.
    "2026-09-20T14:00") - it never appends "Z". Naively parsing that as UTC
    (or subtracting it from an aware `now`) either silently mis-times every
    row by the location's UTC offset, or raises on the naive/aware
    subtraction. The response's top-level `utc_offset_seconds` is what
    converts it back to a real instant.

    Returns {"rows": [...], "utc_offset_seconds": int}.
    """
    url = (
        f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
        f"&hourly={HOURLY_VARS}&wind_speed_unit=kmh&timezone=auto"
        f"&forecast_days={days}&models={model}"
    )
    r = await client.get(url, timeout=25)
    r.raise_for_status()
    j = r.json()
    utc_offset = int(j.get("utc_offset_seconds") or 0)
    hourly = j.get("hourly") or {}
    times: List[str] = hourly.get("time") or []
    now = datetime.now(timezone.utc)
    rows: List[Dict[str, Any]] = []
    for i, iso in enumerate(times):
        try:
            local_naive = datetime.fromisoformat(iso)
        except Exception:
            continue
        valid = local_naive.replace(tzinfo=timezone.utc) - timedelta(seconds=utc_offset)
        horizon = int((valid - now).total_seconds() // 3600)
        row: Dict[str, Any] = {
            "model": model,
            "valid_time": valid.isoformat(),
            "horizon_hours": horizon,
        }
        for om_key, chaser_key in VAR_MAP.items():
            arr = hourly.get(om_key)
            if isinstance(arr, list) and i < len(arr) and arr[i] is not None:
                row[chaser_key] = arr[i]
        rows.append(row)
    return {"rows": rows, "utc_offset_seconds": utc_offset}
