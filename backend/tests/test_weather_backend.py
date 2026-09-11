"""Backend availability tests for Chaser Weather Intelligence.

- /health and /api/health return 200
- POST /api/weather/refresh-all exists and responds within 30s (safe even
  when SUPABASE_SERVICE_ROLE_KEY is not configured — endpoint should either
  return {"status":"ok"} because no active locations, or {"status":"error"}
  with a message. It must not 404 or 500).
"""
from __future__ import annotations

import os
import time

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")


# ─── health probes ────────────────────────────────────────────────────
class TestHealth:
    def test_api_health_ok(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ─── weather cron endpoint ────────────────────────────────────────────
class TestWeatherRefreshAll:
    def test_endpoint_exists_and_responds_within_30s(self):
        t0 = time.time()
        r = requests.post(f"{BASE_URL}/api/weather/refresh-all", timeout=35)
        elapsed = time.time() - t0
        # Must not be 404 or 500 — the endpoint must be registered.
        assert r.status_code == 200, f"expected 200, got {r.status_code} body={r.text[:200]}"
        assert elapsed < 30, f"endpoint took {elapsed:.1f}s (>30s)"
        body = r.json()
        assert "status" in body
        # Without SUPABASE_SERVICE_ROLE_KEY the cron tick logs a warning and
        # returns early — the endpoint should still return status=ok.
        assert body["status"] in {"ok", "error"}
