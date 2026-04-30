"""Push notification channel via Expo Push API."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from netvigil_dispatcher.config import settings

log = logging.getLogger(__name__)

_EXPO_URL = "https://exp.host/--/api/v2/push/send"


async def send(incident: dict[str, Any], expo_push_token: str) -> None:
    title = (
        f"{incident['severity'].upper()}: "
        f"{incident['attack_label'].replace('_', ' ').title()}"
    )
    body = (
        f"{incident['source_ip']} → {incident['destination_ip']} "
        f"(score {incident['anomaly_score']:.2f})"
    )

    payload = {
        "to":    expo_push_token,
        "title": title,
        "body":  body,
        "data":  {"incidentId": incident["id"]},
        "sound": "default",
        "priority": "high" if incident["severity"] in ("high", "critical") else "normal",
    }

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if settings.expo_access_token:
        headers["Authorization"] = f"Bearer {settings.expo_access_token}"

    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(_EXPO_URL, json=payload, headers=headers, timeout=10.0)
            r.raise_for_status()
        log.info("Push sent to %s for incident %s", expo_push_token, incident["id"])
    except Exception as exc:
        log.error("Failed to send push notification: %s", exc)
