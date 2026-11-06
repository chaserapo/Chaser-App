"""
Public spray-job sign-off verification page.

The in-app Sign-off QR (frontend/app/records/[id].tsx) used to encode the
job's raw data as JSON — scanning it with an ordinary camera app just showed
an unreadable blob of text, since nothing anywhere resolved that JSON into
anything. There was no verification: just data with nowhere to go.

This route gives the QR something real to point at: a plain, public,
read-only HTML page at /verify/spray/{job_id} showing the same fields that
used to be in the JSON payload, readable from a phone at the paddock gate.
No auth — deliberately so, since that's the whole point of a gate sign.
Reads via the service_role key (bypasses RLS on purpose, like the weather
cron) since the visitor scanning the code has no Chaser login of their own.

Kept outside the /api router (like /health) so the shareable URL reads as
a normal link, not an API endpoint.
"""
from __future__ import annotations

import html
import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

logger = logging.getLogger("chaser.verify")

router = APIRouter()


def _supabase_conf() -> Optional[Dict[str, str]]:
    url = os.getenv("SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    return {"url": url.rstrip("/"), "key": key}


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
  body {{ margin: 0; padding: 24px 16px 48px; background: #F3F5F3; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0F2A1C; }}
  .wrap {{ max-width: 520px; margin: 0 auto; }}
  .brand {{ display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }}
  .brand .dot {{ width: 10px; height: 10px; border-radius: 5px; background: #16A34A; }}
  .brand span {{ font-weight: 800; font-size: 15px; letter-spacing: 0.2px; }}
  h1 {{ font-size: 22px; margin: 0 0 4px; }}
  .sub {{ color: #4B5B52; font-size: 14px; margin-bottom: 18px; }}
  .badge {{ display: inline-block; background: #DCFCE7; color: #166534; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; margin-bottom: 18px; }}
  .card {{ background: #fff; border: 1px solid #E3E7E3; border-radius: 12px; padding: 16px 18px; margin-bottom: 14px; }}
  .row {{ display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid #EEF1EE; font-size: 14px; }}
  .row:last-child {{ border-bottom: none; }}
  .row .k {{ color: #5A6B61; }}
  .row .v {{ font-weight: 600; text-align: right; }}
  .section-title {{ font-size: 11px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase; color: #5A6B61; margin: 0 0 8px 4px; }}
  .prod {{ padding: 6px 0; font-size: 14px; }}
  .prod b {{ font-weight: 700; }}
  .empty {{ color: #5A6B61; font-size: 14px; }}
  .footer {{ color: #8A968F; font-size: 12px; margin-top: 24px; text-align: center; }}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="dot"></div><span>Chaser</span></div>
  {body}
  <div class="footer">Chaser Weather &amp; Spray Intelligence</div>
</div>
</body>
</html>"""


def _not_found(job_id: str) -> HTMLResponse:
    body = f"""
  <h1>Record not found</h1>
  <p class="sub">No spray record matches this code ({html.escape(job_id[:8])}…). It may have been deleted.</p>
"""
    return HTMLResponse(_page("Record not found · Chaser", body), status_code=404)


def _row(label: str, value: Any) -> str:
    v = "—" if value is None or value == "" else html.escape(str(value))
    return f'<div class="row"><div class="k">{html.escape(label)}</div><div class="v">{v}</div></div>'


def _error_page(job_id: str) -> HTMLResponse:
    body = f"""
  <h1>Couldn't load this record</h1>
  <p class="sub">Something went wrong generating this page. Please try again in a moment.</p>
"""
    return HTMLResponse(_page("Unavailable · Chaser", body), status_code=500)


@router.get("/verify/spray/{job_id}", response_class=HTMLResponse)
async def verify_spray_job(job_id: str) -> HTMLResponse:
    conf = _supabase_conf()
    if not conf:
        return HTMLResponse(_page("Unavailable · Chaser", "<h1>Verification unavailable</h1><p class=\"sub\">Please try again shortly.</p>"), status_code=503)

    # Any failure here (bad/blocked network call, an unexpected response
    # shape from Supabase, a rendering bug) must never surface as a raw,
    # unstyled 500 — that's what made this a bare "Internal Server Error"
    # with no clue what broke. Log the real exception server-side (visible
    # in Railway's logs) and show a clean page to whoever scanned the code.
    try:
        async with httpx.AsyncClient() as client:
            headers = {"apikey": conf["key"], "Authorization": f"Bearer {conf['key']}"}
            job_r = await client.get(
                f"{conf['url']}/rest/v1/spray_jobs",
                params={"id": f"eq.{job_id}", "deleted_at": "is.null", "select": "*"},
                headers=headers, timeout=15,
            )
            if not job_r.is_success:
                logger.error("verify_spray_job: spray_jobs query failed job_id=%s status=%s body=%s", job_id, job_r.status_code, job_r.text[:500])
                return _error_page(job_id)
            jobs: List[Dict[str, Any]] = job_r.json()
            if not jobs:
                return _not_found(job_id)
            j = jobs[0]

            prod_r = await client.get(
                f"{conf['url']}/rest/v1/spray_job_products",
                params={"spray_job_id": f"eq.{job_id}", "select": "*"},
                headers=headers, timeout=15,
            )
            if not prod_r.is_success:
                logger.error("verify_spray_job: spray_job_products query failed job_id=%s status=%s body=%s", job_id, prod_r.status_code, prod_r.text[:500])
                return _error_page(job_id)
            products: List[Dict[str, Any]] = prod_r.json()
    except Exception:
        logger.exception("verify_spray_job: request to Supabase failed job_id=%s", job_id)
        return _error_page(job_id)

    try:
        return _render_spray_job(j, products)
    except Exception:
        logger.exception("verify_spray_job: rendering failed job_id=%s", job_id)
        return _error_page(job_id)


def _render_spray_job(j: Dict[str, Any], products: List[Dict[str, Any]]) -> HTMLResponse:
    status = j.get("status")
    badge = '<div class="badge">✓ Completed</div>' if status == "completed" else f'<div class="badge" style="background:#FEF3C7;color:#92400E;">{html.escape((status or "draft").upper())}</div>'

    area = j.get("actual_area_ha") if j.get("actual_area_ha") is not None else j.get("area_ha")
    area_str = f"{area} ha" if area is not None else None

    wind = None
    if j.get("wind_speed") is not None:
        wind = f"{j['wind_speed']} km/h {j.get('wind_direction') or ''}".strip()
    finish_wind = None
    if j.get("finish_wind_speed") is not None:
        finish_wind = f"{j['finish_wind_speed']} km/h {j.get('finish_wind_direction') or ''}".strip()

    products_html = "".join(
        f'<div class="prod"><b>{html.escape(p.get("chemical_name") or "Product")}</b> — {p.get("rate")} {html.escape(p.get("unit") or "")}'
        + (f' (total {float(p["total_qty"]):.2f} {html.escape(p.get("total_qty_unit") or "")})' if p.get("total_qty") is not None else "")
        + "</div>"
        for p in products
    ) or '<div class="empty">No products recorded.</div>'

    body = f"""
  <h1>{html.escape(j.get("paddock_name") or "Spray Record")}</h1>
  <div class="sub">{html.escape(j.get("farm_name") or "")} · {html.escape(j.get("date") or "")}</div>
  {badge}

  <div class="card">
    {_row("Crop", j.get("crop"))}
    {_row("Target", j.get("target"))}
    {_row("Operator", j.get("operator"))}
    {_row("Machine", j.get("machinery_name"))}
    {_row("Area treated", area_str)}
    {_row("Start / Finish", f'{j.get("start_time") or "—"} → {j.get("finish_time") or "—"}')}
  </div>

  <div class="section-title">Products applied</div>
  <div class="card">{products_html}</div>

  <div class="section-title">Starting weather</div>
  <div class="card">
    {_row("Temperature", f'{j["temperature_c"]} °C' if j.get("temperature_c") is not None else None)}
    {_row("Relative humidity", f'{j["humidity"]} %' if j.get("humidity") is not None else None)}
    {_row("Delta T", j.get("delta_t"))}
    {_row("Wind", wind)}
  </div>
"""

    if j.get("finish_temperature_c") is not None or j.get("finish_wind_speed") is not None:
        body += f"""
  <div class="section-title">Finish weather</div>
  <div class="card">
    {_row("Temperature", f'{j["finish_temperature_c"]} °C' if j.get("finish_temperature_c") is not None else None)}
    {_row("Relative humidity", f'{j["finish_humidity"]} %' if j.get("finish_humidity") is not None else None)}
    {_row("Wind", finish_wind)}
  </div>
"""

    if j.get("notes") or j.get("finish_notes"):
        notes_html = "".join(
            f'<div class="prod">{html.escape(n)}</div>' for n in [j.get("notes"), j.get("finish_notes")] if n
        )
        body += f'<div class="section-title">Notes</div><div class="card">{notes_html}</div>'

    return HTMLResponse(_page(f"{j.get('paddock_name') or 'Spray Record'} · Chaser", body))
