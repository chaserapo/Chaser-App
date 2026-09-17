"""
Chaser overdue-alerts — backend scheduled push notifier.

Every N hours (default 24, override via env ALERTS_CRON_HOURS) this task:
  1. Reads overdue maintenance_schedules rows and open farm_issues rows
     directly from Supabase using the service_role key (bypasses RLS on
     purpose — this is a backend task), same as weather_cron.py.
  2. Records each one in notification_log (unique per kind+ref_id) so a
     given overdue service or open fault is only ever pushed once.
  3. Sends an Expo push notification to every push token registered for the
     affected business.

Runs as an asyncio background task started on app boot. Kept dependency-light
like weather_cron.py: `httpx` + `os` + `asyncio` — no APScheduler.

Note: this REQUIRES the Supabase service_role key. If it's not configured,
the task logs a warning and stays idle so the app still works.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("chaser.alerts")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _cron_hours() -> int:
    try:
        return max(1, int(os.getenv("ALERTS_CRON_HOURS", "24")))
    except ValueError:
        return 24


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
    turns "overdue every tick" into "alert once per item"."""
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


async def _push_tokens_by_business(client: httpx.AsyncClient, conf: Dict[str, str]) -> Dict[str, List[str]]:
    rows = await _sb_get(client, conf, "push_tokens", {"select": "business_id,token"})
    by_business: Dict[str, List[str]] = {}
    for row in rows or []:
        by_business.setdefault(row["business_id"], []).append(row["token"])
    return by_business


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
            logger.warning("alerts cron: push send failed for a batch: %s", e)


async def _cron_tick() -> None:
    conf = _supabase_conf()
    if not conf:
        logger.warning("alerts cron: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping tick")
        return
    async with httpx.AsyncClient() as client:
        maint_rows = await _sb_get(client, conf, "maintenance_schedules", {
            "select": "id,business_id,machinery_id,maintenance_type,next_service_hours,machinery(name,current_hours,archived_at,deleted_at)",
            "deleted_at": "is.null",
            "next_service_hours": "not.is.null",
        })
        overdue_maint = [
            m for m in (maint_rows or [])
            if m.get("machinery") and not m["machinery"].get("archived_at") and not m["machinery"].get("deleted_at")
            and m["machinery"].get("current_hours") is not None
            and m["machinery"]["current_hours"] >= m["next_service_hours"]
        ]

        open_issues = await _sb_get(client, conf, "farm_issues", {
            "select": "id,business_id,machinery_id,title,severity,status,machinery(name)",
            "deleted_at": "is.null",
            "status": "in.(open,assigned,in_progress)",
        }) or []

        new_maint = await _sb_insert_new(
            client, conf, "notification_log",
            [{"business_id": m["business_id"], "kind": "overdue_maintenance", "ref_id": m["id"]} for m in overdue_maint],
            on_conflict="kind,ref_id",
        )
        new_issues = await _sb_insert_new(
            client, conf, "notification_log",
            [{"business_id": i["business_id"], "kind": "open_fault", "ref_id": i["id"]} for i in open_issues],
            on_conflict="kind,ref_id",
        )
        new_maint_ids = {r["ref_id"] for r in (new_maint or [])}
        new_issue_ids = {r["ref_id"] for r in (new_issues or [])}
        if not new_maint_ids and not new_issue_ids:
            logger.info("alerts cron: nothing new to alert on")
            return

        tokens_by_business = await _push_tokens_by_business(client, conf)
        messages: List[Dict[str, Any]] = []

        for m in overdue_maint:
            if m["id"] not in new_maint_ids:
                continue
            tokens = tokens_by_business.get(m["business_id"]) or []
            machine_name = (m.get("machinery") or {}).get("name") or "A machine"
            for t in tokens:
                messages.append({
                    "to": t,
                    "title": "Service overdue",
                    "body": f"{machine_name}: {m['maintenance_type']} is overdue.",
                    "data": {"type": "overdue_maintenance", "machineryId": m["machinery_id"]},
                })

        for i in open_issues:
            if i["id"] not in new_issue_ids:
                continue
            tokens = tokens_by_business.get(i["business_id"]) or []
            machine_name = (i.get("machinery") or {}).get("name")
            subject = f"{machine_name}: " if machine_name else ""
            for t in tokens:
                messages.append({
                    "to": t,
                    "title": f"{(i.get('severity') or 'new').capitalize()} fault reported",
                    "body": f"{subject}{i['title']}",
                    "data": {"type": "open_fault", "machineryId": i.get("machinery_id")},
                })

        if messages:
            await _send_push(client, messages)
        logger.info(
            "alerts cron: %d new maintenance alert(s), %d new fault alert(s), %d push message(s) sent",
            len(new_maint_ids), len(new_issue_ids), len(messages),
        )


async def alerts_cron_loop() -> None:
    """Background loop — runs forever, sleeps between ticks."""
    hours = _cron_hours()
    logger.info("alerts cron: starting (every %sh)", hours)
    # Initial short delay so app boot isn't blocked.
    await asyncio.sleep(90)
    while True:
        try:
            await _cron_tick()
        except Exception as e:  # pragma: no cover
            logger.exception("alerts cron tick raised: %s", e)
        await asyncio.sleep(hours * 3600)
