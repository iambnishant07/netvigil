"""SMS alert channel via Twilio REST API."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from aankhanet_dispatcher.config import settings

log = logging.getLogger(__name__)

_TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


async def send(incident: dict[str, Any], to_number: str) -> None:
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        log.warning("Twilio credentials not configured — skipping SMS")
        return

    body = (
        f"AankhaNet {incident['severity'].upper()}: "
        f"{incident['attack_label'].replace('_', ' ').title()} "
        f"from {incident['source_ip']} "
        f"(score {incident['anomaly_score']:.2f})"
    )

    url = _TWILIO_URL.format(sid=settings.twilio_account_sid)
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                url,
                data={"From": settings.twilio_from_number, "To": to_number, "Body": body},
                auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                timeout=10.0,
            )
            r.raise_for_status()
        log.info("SMS sent to %s for incident %s", to_number, incident["id"])
    except Exception as exc:
        log.error("Failed to send SMS: %s", exc)
