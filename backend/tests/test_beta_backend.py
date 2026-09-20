"""Chaser beta launch-readiness backend tests.
Covers:
- /health and /api/ and /api/health
- /api/invitations/{id}/send-email auth & payload validation (401/422/etc.)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://chaser-app-production.up.railway.app").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------- Health ----------------------------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("message") == "Hello World"

    def test_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/health", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "ok"

    def test_api_health(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "ok"


# ---------------------------- Invitations ------------------------
# Route: POST /api/invitations/{invitation_id}/send-email
# Path constraint: min_length=36 max_length=36 (UUID)
class TestInvitations:
    def test_missing_auth_returns_401(self, api_client):
        inv_id = str(uuid.uuid4())
        r = api_client.post(f"{BASE_URL}/api/invitations/{inv_id}/send-email", timeout=15)
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"
        body = r.json()
        assert "detail" in body

    def test_non_bearer_auth_returns_401(self, api_client):
        inv_id = str(uuid.uuid4())
        r = api_client.post(
            f"{BASE_URL}/api/invitations/{inv_id}/send-email",
            headers={"Authorization": "Basic zzz"},
            timeout=15,
        )
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"

    def test_invalid_length_invitation_id_returns_422(self, api_client):
        # obviously invalid payload — non-UUID length path parameter
        r = api_client.post(
            f"{BASE_URL}/api/invitations/not-a-uuid/send-email",
            headers={"Authorization": "Bearer fake"},
            timeout=15,
        )
        # FastAPI Path constraint should reject as 422
        assert r.status_code in (400, 422), f"expected 4xx got {r.status_code}: {r.text}"

    def test_valid_length_bogus_token_returns_403_or_404(self, api_client):
        # 36-char UUID with a bogus Bearer token — Supabase must reject → backend returns 403
        # or 404 (invitation not found via RLS).
        inv_id = str(uuid.uuid4())
        r = api_client.post(
            f"{BASE_URL}/api/invitations/{inv_id}/send-email",
            headers={"Authorization": "Bearer eyJfake.jwt.token"},
            timeout=20,
        )
        assert r.status_code in (401, 403, 404), (
            f"expected 401/403/404 got {r.status_code}: {r.text}"
        )
