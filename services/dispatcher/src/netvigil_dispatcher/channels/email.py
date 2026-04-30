"""Email alert channel using aiosmtplib."""
from __future__ import annotations

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib

from netvigil_dispatcher.config import settings

log = logging.getLogger(__name__)


async def send(incident: dict[str, Any], rule: dict[str, Any], to_address: str) -> None:
    subject = (
        f"[NetVigil {incident['severity'].upper()}] "
        f"{incident['attack_label'].replace('_', ' ').title()} detected"
    )
    body = (
        f"NetVigil Alert\n\n"
        f"Severity:   {incident['severity']}\n"
        f"Type:       {incident['attack_label']}\n"
        f"MITRE:      {incident['mitre_technique']}\n"
        f"Source:     {incident['source_ip']}\n"
        f"Destination:{incident['destination_ip']}\n"
        f"Score:      {incident['anomaly_score']:.2f}\n\n"
        f"{incident.get('narrative') or 'No narrative available.'}\n\n"
        f"View in NetVigil: https://netvigil.example/incidents/{incident['id']}"
    )

    msg = MIMEMultipart()
    msg["From"]    = settings.alert_from_email
    msg["To"]      = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_port == 587,
        )
        log.info("Email alert sent to %s for incident %s", to_address, incident["id"])
    except Exception as exc:
        log.error("Failed to send email alert: %s", exc)
