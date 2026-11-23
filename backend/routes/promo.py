"""
First-100 signup promo eligibility check.

This only answers "is this caller's business among the first 100 ever
created" — it doesn't grant anything itself. The free month is delivered as
a real store subscription purchase (an App Store Promotional Offer / Play
developer-determined offer, applied client-side through RevenueCat), so
Apple's and Google's own "new subscribers only" rules are what stop someone
reusing it — this endpoint only decides whether to show them that
discounted purchase option in the first place.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

FIRST_N = 100

# Read lazily (os.getenv, not os.environ[...]): server.py imports this
# module to build its routes, so a KeyError here would take down the whole
# app over this one route's settings — see routes/account.py for the same
# pattern.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")


def _service_role_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Promo eligibility is not configured on this server")
    # Strip stray whitespace/newlines from a pasted key — see the same fix
    # in routes/account.py's _service_role_key for why.
    key = "".join(key.split())
    if not key:
        raise HTTPException(status_code=503, detail="Promo eligibility is not configured on this server")
    return key


async def _get_caller(authorization: str) -> dict:
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Supabase is not configured on this server")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_PUBLISHABLE_KEY, "Authorization": authorization},
        )
    if r.status_code >= 400:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return r.json()


@router.get("/promo/first-100-eligible")
async def first_100_eligible(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    caller = await _get_caller(authorization)
    user_id = caller.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    service_key = _service_role_key()
    service_headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # The promo attaches to the business created at signup, not to
            # every team member invited into it later — so only its owner
            # is checked against the first-100 ranking.
            owned_r = await client.get(
                f"{SUPABASE_URL}/rest/v1/business_members",
                params={"user_id": f"eq.{user_id}", "role": "eq.owner", "select": "business_id"},
                headers=service_headers,
            )
            if owned_r.status_code >= 400:
                raise HTTPException(status_code=502, detail="Could not look up your business")
            owned = owned_r.json()
            if not owned:
                return {"eligible": False, "reason": "not_a_business_owner"}
            business_id = owned[0]["business_id"]

            first_n_r = await client.get(
                f"{SUPABASE_URL}/rest/v1/businesses",
                params={"select": "id", "order": "created_at.asc", "limit": str(FIRST_N)},
                headers=service_headers,
            )
            if first_n_r.status_code >= 400:
                raise HTTPException(status_code=502, detail="Could not check promo eligibility")
            first_n_ids = {row["id"] for row in first_n_r.json()}
    except HTTPException:
        raise
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Promo eligibility check failed — please try again.") from e

    return {"eligible": business_id in first_n_ids}
