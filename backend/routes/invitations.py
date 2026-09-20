"""
Invitation email route for Chaser.

Security model:
- Caller sends their Supabase JWT in Authorization: Bearer.
- Backend queries Supabase REST with that JWT as `apikey` + `Authorization`.
- RLS on `member_invitations` restricts SELECT to `is_business_member(business_id)`,
  and RLS on `businesses` restricts SELECT to owner_id or member. Combined with the
  `invitations_insert` policy (owner-only), the invitation the caller wants to send
  an email for can only be fetched if they legitimately just created it. No
  service-role key is used, so we cannot bypass RLS server-side.
- Recipient + subject + body are constructed server-side from the invitation row;
  the caller only supplies the invitation ID (satisfies G4 no-open-relay).
"""

import os
import re
import ipaddress
import logging
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Header, HTTPException, Path
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Emergent-managed email proxy — CONSTANT, not env-read.
#
# Read lazily (os.getenv, not os.environ[...]) rather than hard-requiring
# these at import time: server.py imports this module to build its routes,
# so a KeyError here previously took down the *entire* app - every route and
# every background cron - over a single missing invitations-only setting.
# Each var is checked for real at the point it's used instead.
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.getenv("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.getenv("EMAIL_FROM_NAME")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY")
APP_URL = os.environ.get("APP_URL", "https://hectarehq.app")

# ---------------------------------------------------------------------------
# Email safety gate (verbatim from playbook — G2 + G3 defense-in-depth)
# ---------------------------------------------------------------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> str | None:
    if not EMAIL_KEY or not EMAIL_FROM_NAME:
        raise HTTPException(status_code=503, detail="Email sending is not configured on this server")
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        raise HTTPException(status_code=502, detail="Failed to send email")
    except Exception as e:
        logger.error("Email send error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send email")


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------
class SendInviteResponse(BaseModel):
    status: str
    email_id: str | None = None


async def _supabase_select(path: str, auth_header: str) -> list[dict]:
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Supabase is not configured on this server")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": auth_header,
                "Accept": "application/json",
            },
        )
    if r.status_code >= 400:
        logger.warning("Supabase select failed %s: %s", r.status_code, r.text[:400])
        raise HTTPException(status_code=403, detail="Not authorised")
    return r.json()


def _render_email_html(*, business_name: str, inviter_email: str, role: str, invited_email: str, app_url: str) -> tuple[str, str]:
    role_h = "Manager" if role == "manager" else "Operator"
    role_summary = (
        "You'll be able to add and update farms, chemicals, machinery and records — a full operational partner on the property."
        if role == "manager"
        else "You'll be able to view farm info and log spray jobs, machinery hours and completed services."
    )
    subject = f"You're invited to join {business_name} on Chaser"
    html = (
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAF7;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif">'
        f'<tr><td align="center" style="padding:32px 16px">'
        f'<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05)">'
        f'<tr><td style="padding:32px 32px 4px 32px">'
        f'<div style="font-size:20px;color:#3B6E3B;font-weight:800;letter-spacing:0.5px">Chaser</div>'
        f'<div style="font-size:12px;color:#6B7F73;font-style:italic;margin-top:2px">Behind every good operation</div>'
        f'<h1 style="margin:20px 0 8px 0;color:#1E2A24;font-size:22px;line-height:28px">You\'re invited to join {escape(business_name)}</h1>'
        f'<p style="margin:0;color:#4C5A52;font-size:15px;line-height:22px">{escape(inviter_email)} has invited you to join <strong>{escape(business_name)}</strong> as a <strong>{role_h}</strong>.</p>'
        f'</td></tr>'
        f'<tr><td style="padding:16px 32px">'
        f'<div style="background:#EFF5EC;border-radius:12px;padding:16px 18px;color:#1E2A24;font-size:14px;line-height:20px">'
        f'<strong style="color:#3B6E3B">Your role: {role_h}</strong><br/>'
        f'<span style="color:#4C5A52">{escape(role_summary)}</span>'
        f'</div>'
        f'</td></tr>'
        f'<tr><td style="padding:16px 32px 8px 32px" align="center">'
        f'<a href="{escape(app_url)}" style="display:inline-block;background:#3B6E3B;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px">Open Chaser and accept</a>'
        f'</td></tr>'
        f'<tr><td style="padding:8px 32px 24px 32px">'
        f'<p style="margin:0;color:#4C5A52;font-size:13px;line-height:19px">Sign up (or sign in) with <strong>{escape(invited_email)}</strong> — you\'ll automatically join {escape(business_name)} once you\'re in.</p>'
        f'</td></tr>'
        f'<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #E5EAE6">'
        f'<p style="margin:0;color:#8A9990;font-size:11px;line-height:16px">This invitation was sent from <strong>Chaser</strong> on behalf of {escape(business_name)}. If you weren\'t expecting it, you can safely ignore this email — no action is required. Chaser never asks for your password or payment details by email.</p>'
        f'</td></tr>'
        f'</table>'
        f'</td></tr></table>'
    )
    return subject, html


@router.post("/invitations/{invitation_id}/send-email", response_model=SendInviteResponse)
async def send_invitation_email(
    invitation_id: str = Path(..., min_length=36, max_length=36),
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    # 1) Fetch the invitation using the caller's JWT — RLS returns 0 rows if the
    #    caller is not a member of the business that owns this invitation.
    invitations = await _supabase_select(
        f"member_invitations?id=eq.{invitation_id}&select=id,business_id,email,role,invited_by,accepted_at,revoked_at",
        authorization,
    )
    if not invitations:
        raise HTTPException(status_code=404, detail="Invitation not found or access denied")
    inv = invitations[0]
    if inv.get("accepted_at") or inv.get("revoked_at"):
        raise HTTPException(status_code=409, detail="Invitation is no longer pending")

    # 2) Fetch the business name (RLS: caller must be a member — they are, since #1 succeeded).
    businesses = await _supabase_select(
        f"businesses?id=eq.{inv['business_id']}&select=id,name",
        authorization,
    )
    business_name = businesses[0]["name"] if businesses else "your farm"

    # 3) Fetch the inviter's email via the same helper we use for the Team screen.
    #    list_business_members returns the caller-visible members (RLS enforced).
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/list_business_members",
            headers={
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": authorization,
                "Content-Type": "application/json",
            },
            json={"p_business_id": inv["business_id"]},
        )
    inviter_email = "your team"
    if r.status_code < 400:
        for m in r.json():
            if m.get("user_id") == inv.get("invited_by"):
                inviter_email = m.get("email") or inviter_email
                break

    subject, html = _render_email_html(
        business_name=business_name,
        inviter_email=inviter_email,
        role=inv["role"],
        invited_email=inv["email"],
        app_url=APP_URL,
    )
    email_id = await send_email(to=inv["email"], subject=subject, html=html)
    logger.info("Sent invitation email to %s for business %s (msg=%s)", inv["email"], inv["business_id"], email_id)
    return SendInviteResponse(status="success", email_id=email_id)
