"""
Account deletion — required for App Store review (Guideline 5.1.1(v)): an app
that lets someone create an account must let them delete it from inside the
app, not just by emailing support.

Security model:
- The caller sends their own Supabase JWT (Authorization: Bearer). We resolve
  their identity from Supabase Auth itself (GET /auth/v1/user) rather than
  trusting any user id the client might supply.
- Reads (their memberships, and who else is in each business) go through
  Supabase REST with that same JWT, so RLS decides what they can see - same
  pattern as routes/invitations.py.
- Deleting the Auth user and the business_members rows are both
  admin-only operations, so those two writes use the service_role key. If a
  business has other members and this user is its owner, we refuse rather
  than silently leave the business without one — the owner needs to
  transfer ownership or remove the other members first.
"""
from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, Header, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

# Read lazily (os.getenv, not os.environ[...]): server.py imports this module
# to build its routes, so a KeyError here would take down the entire app -
# every route and every background cron - over one missing setting.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")


def _service_role_key() -> str:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not key:
        raise HTTPException(status_code=503, detail="Account deletion is not configured on this server")
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


async def _memberships_for(client: httpx.AsyncClient, user_id: str, authorization: str) -> list[dict]:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/business_members",
        params={"user_id": f"eq.{user_id}", "select": "business_id,role"},
        headers={"apikey": SUPABASE_PUBLISHABLE_KEY, "Authorization": authorization},
    )
    if r.status_code >= 400:
        raise HTTPException(status_code=403, detail="Could not read your business memberships")
    return r.json()


async def _member_count(client: httpx.AsyncClient, business_id: str, authorization: str) -> int:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/business_members",
        params={"business_id": f"eq.{business_id}", "select": "user_id"},
        headers={"apikey": SUPABASE_PUBLISHABLE_KEY, "Authorization": authorization},
    )
    if r.status_code >= 400:
        raise HTTPException(status_code=403, detail="Could not read business membership")
    return len(r.json())


@router.delete("/account")
async def delete_account(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    caller = await _get_caller(authorization)
    user_id = caller.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with httpx.AsyncClient(timeout=15) as client:
        memberships = await _memberships_for(client, user_id, authorization)
        for m in memberships:
            if m.get("role") == "owner":
                count = await _member_count(client, m["business_id"], authorization)
                if count > 1:
                    raise HTTPException(
                        status_code=409,
                        detail="You own a business with other team members. Transfer ownership or remove them from Team first, then delete your account.",
                    )

        service_key = _service_role_key()
        service_headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}

        # Leave any business (as owner of a solo business, or as a non-owner
        # member of someone else's) before the login itself is removed.
        del_r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/business_members",
            params={"user_id": f"eq.{user_id}"},
            headers=service_headers,
        )
        if del_r.status_code >= 400:
            logger.error("account deletion: membership cleanup failed for %s: %s", user_id, del_r.text[:300])
            raise HTTPException(status_code=502, detail="Could not remove your business membership")

        auth_del_r = await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=service_headers,
        )
        if auth_del_r.status_code >= 400 and auth_del_r.status_code != 404:
            logger.error("account deletion: auth user delete failed for %s: %s", user_id, auth_del_r.text[:300])
            raise HTTPException(status_code=502, detail="Could not delete your account")

    logger.info("account deletion: removed user %s", user_id)
    return {"status": "ok"}
