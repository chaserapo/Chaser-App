"""Unit tests for /api/dpird/nearest with DPIRD mocked (no network, no
deployed backend needed).

- picks the nearest open station within 30 km and returns its latest reading
- maps 10 m wind/gusts and 3 m wind, skips rows with no temperature
- returns station null outside WA, beyond 30 km, without a key, or for stale data
- caches the station list and readings
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import routes.dpird as dpird

NOW = datetime.now(timezone.utc).replace(second=0, microsecond=0)


def _iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _summary(to: datetime, temp):
    return {
        "period": {"to": _iso(to)},
        "airTemperature": {"avg": temp},
        "relativeHumidity": {"avg": 48},
        "deltaT": {"avg": 7.3},
        "wind": [
            {"height": 3, "avg": {"speed": 4.5, "direction": {"compassPoint": "S"}}, "max": {"speed": 7}},
            {"height": 10, "avg": {"speed": 11.2, "direction": {"compassPoint": "SSE"}}, "max": {"speed": 18.4}},
        ],
    }


@pytest.fixture
def client(monkeypatch):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        assert request.url.params["api_key"] == "test-key"
        if request.url.path.endswith("/stations/"):
            return httpx.Response(200, json={"collection": [
                {"stationCode": "ME", "stationName": "Merredin", "latitude": -31.47, "longitude": 118.28, "status": "open"},
                {"stationCode": "OLD", "stationName": "Closed", "latitude": -31.48, "longitude": 118.28, "status": "closed"},
                {"stationCode": "ST", "stationName": "Stale", "latitude": -32.93, "longitude": 117.18, "status": "open"},
            ]})
        code = request.url.params["stationCode"]
        if code == "ME":
            rows = [_summary(NOW - timedelta(minutes=30), 21), _summary(NOW - timedelta(minutes=15), 22.4),
                    {"period": {"to": _iso(NOW)}, "airTemperature": {"avg": None}}]
        else:
            rows = [_summary(NOW - timedelta(hours=9), 15)]
        return httpx.Response(200, json={"collection": [{"stationCode": code, "summaries": rows}]})

    real = httpx.AsyncClient
    monkeypatch.setattr(dpird.httpx, "AsyncClient", lambda *a, **k: real(transport=httpx.MockTransport(handler)))
    monkeypatch.setenv("DPIRD_API_KEY", "test-key")
    monkeypatch.setattr(dpird, "_stations", (0.0, []))
    monkeypatch.setattr(dpird, "_readings", {})
    app = FastAPI()
    app.include_router(dpird.router, prefix="/api")
    c = TestClient(app)
    c.calls = calls
    return c


def test_nearest_station_reading(client):
    r = client.get("/api/dpird/nearest", params={"lat": -31.48, "lon": 118.27})
    assert r.status_code == 200
    body = r.json()
    assert body["station"]["code"] == "ME" and body["station"]["km"] < 3
    rd = body["reading"]
    assert rd["temp_c"] == 22.4  # last row with a temperature
    assert rd["delta_t"] == 7.3 and rd["rh"] == 48
    assert rd["wind_kmh"] == 11.2 and rd["gust_kmh"] == 18.4 and rd["wind_dir"] == "SSE"
    assert rd["wind_height_m"] == 10 and rd["wind3_kmh"] == 4.5


def test_cached(client):
    for _ in range(3):
        client.get("/api/dpird/nearest", params={"lat": -31.48, "lon": 118.27})
    assert len(client.calls) == 2  # one station list + one reading


def test_stale_reading_hidden(client):
    r = client.get("/api/dpird/nearest", params={"lat": -32.93, "lon": 117.18})
    assert r.json() == {"station": None}


@pytest.mark.parametrize("lat,lon", [(-33.87, 151.21), (-29.0, 125.0)])
def test_outside_wa_or_too_far(client, lat, lon):
    assert client.get("/api/dpird/nearest", params={"lat": lat, "lon": lon}).json() == {"station": None}


def test_no_key(client, monkeypatch):
    monkeypatch.delenv("DPIRD_API_KEY")
    assert client.get("/api/dpird/nearest", params={"lat": -31.48, "lon": 118.27}).json() == {"station": None}
    assert client.calls == []
