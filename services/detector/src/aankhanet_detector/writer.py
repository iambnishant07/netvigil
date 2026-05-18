"""Writes confirmed incidents to PostgreSQL and flow metrics to InfluxDB."""
from __future__ import annotations

import json
import logging
from typing import Any

import asyncpg
from influxdb_client.client.influxdb_client_async import InfluxDBClientAsync
from influxdb_client.client.write_api import ASYNCHRONOUS
from influxdb_client.domain.write_precision import WritePrecision

from aankhanet_detector.config import settings

log = logging.getLogger(__name__)

_SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]
_MIN_SCORE = 0.40


async def write_incident(
    pool: asyncpg.Pool,
    org_id: str,
    device_id: str,
    record: dict[str, Any],
    anomaly_score: float,
    attack_label: str,
    mitre_technique: str,
    severity: str,
    narrative: str | None,
    top_features: list[dict[str, Any]],
) -> str | None:
    if anomaly_score < _MIN_SCORE:
        return None

    from aankhanet_detector.config import settings as s

    # Import uuid7 equivalent without depending on the API package
    import os
    import time
    import uuid

    ms = int(time.time() * 1000)
    rand = os.urandom(10)
    rand_a = int.from_bytes(rand[:2], "big") & 0x0FFF
    rand_b = int.from_bytes(rand[2:], "big") & 0x3FFF_FFFF_FFFF_FFFF
    val = (ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    incident_id = str(uuid.UUID(int=val))

    src_ip = record.get("ipv4_src_addr") or record.get("src", "0.0.0.0")
    dst_ip = record.get("ipv4_dst_addr") or record.get("dst", "0.0.0.0")

    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO incidents
                 (id, organization_id, device_id, detected_at, severity, status,
                  attack_label, mitre_technique, source_ip, destination_ip,
                  anomaly_score, narrative, top_features)
               VALUES($1,$2,$3,now(),$4,'open',$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT DO NOTHING""",
            incident_id, org_id, device_id, severity,
            attack_label, mitre_technique, src_ip, dst_ip,
            float(anomaly_score), narrative, json.dumps(top_features),
        )
    log.info("Wrote incident %s [%s %s]", incident_id, severity, attack_label)
    return incident_id


async def write_flow_metric(record: dict[str, Any], device_id: str) -> None:
    try:
        async with InfluxDBClientAsync(
            url=settings.influxdb_url,
            token=settings.influxdb_token,
            org=settings.influxdb_org,
        ) as client:
            write_api = client.write_api()
            point = (
                f"flow,device_id={device_id} "
                f"bytes={record.get('in_bytes', record.get('bytes', 0))}i,"
                f"packets={record.get('in_pkts', record.get('packets', 0))}i"
            )
            await write_api.write(bucket=settings.influxdb_bucket, record=point)
    except Exception as exc:
        log.debug("InfluxDB write failed (non-critical): %s", exc)
