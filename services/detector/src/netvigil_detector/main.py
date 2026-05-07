"""Detector entrypoint.

Consumes raw.syslog, raw.netflow, raw.pcap from Kafka.
For each flow: extract features → score ensemble → map MITRE → generate
narrative → write incident to Postgres + flow metric to InfluxDB.
"""
from __future__ import annotations

import asyncio
import json
import logging
import ssl
from typing import Any

import asyncpg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from netvigil_detector import ensemble, mitre, narrative, writer
from netvigil_detector.config import settings


def _kafka_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {
        "bootstrap_servers": settings.kafka_bootstrap_servers,
    }
    if settings.kafka_security_protocol == "SASL_SSL":
        kwargs["security_protocol"] = "SASL_SSL"
        kwargs["sasl_mechanism"] = settings.kafka_sasl_mechanism
        kwargs["sasl_plain_username"] = settings.kafka_sasl_username
        kwargs["sasl_plain_password"] = settings.kafka_sasl_password
        kwargs["ssl_context"] = ssl.create_default_context()
    return kwargs

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

TOPICS = ["raw.syslog", "raw.netflow", "raw.pcap"]
INCIDENT_TOPIC = "incidents.created"


async def _process(
    record: dict[str, Any],
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    producer: AIOKafkaProducer,
) -> None:
    org_id    = record.get("org_id", "")
    device_id = record.get("device_id", "")
    if not org_id or not device_id:
        return

    await writer.write_flow_metric(record, device_id)

    score, label, top_features = ensemble.score(record)
    log.info("Scored record: score=%.3f label=%s org=%s", score, label, org_id)
    tech      = mitre.get_technique(label)
    severity  = mitre.score_to_severity(score, label)
    narr      = await narrative.generate(
        label,
        src=record.get("ipv4_src_addr") or record.get("src", ""),
        dst=record.get("ipv4_dst_addr") or record.get("dst", ""),
        score=score,
        severity=severity,
        top_features=top_features,
        api_key=settings.anthropic_api_key,
    )

    incident_id = await writer.write_incident(
        pool=pool,
        org_id=org_id,
        device_id=device_id,
        record=record,
        anomaly_score=score,
        attack_label=label,
        mitre_technique=tech,
        severity=severity,
        narrative=narr,
        top_features=top_features,
    )

    if incident_id:
        event = {
            "id": incident_id,
            "organization_id": org_id,
            "device_id": device_id,
            "severity": severity,
            "attack_label": label,
            "mitre_technique": tech,
            "anomaly_score": score,
            "narrative": narr,
            "source_ip": record.get("ipv4_src_addr") or record.get("src", ""),
            "destination_ip": record.get("ipv4_dst_addr") or record.get("dst", ""),
        }
        await producer.send_and_wait(
            INCIDENT_TOPIC, json.dumps(event).encode()
        )
        log.info("Published incident %s to %s", incident_id, INCIDENT_TOPIC)


async def _make_pool() -> asyncpg.Pool:  # type: ignore[return]
    dsn = settings.asyncpg_dsn
    if "neon.tech" in dsn or "sslmode" in dsn:
        clean = dsn.split("?")[0]
        return await asyncpg.create_pool(clean, ssl=ssl.create_default_context(), min_size=1, max_size=10, statement_cache_size=0)  # type: ignore[return-value]
    return await asyncpg.create_pool(dsn, min_size=1, max_size=10)  # type: ignore[return-value]


async def main() -> None:
    ensemble.load_models()

    pool: asyncpg.Pool = await _make_pool()  # type: ignore[type-arg]

    producer = AIOKafkaProducer(
        value_serializer=lambda v: v if isinstance(v, bytes) else v,
        **_kafka_kwargs(),
    )
    await producer.start()

    consumer = AIOKafkaConsumer(
        *TOPICS,
        group_id=settings.kafka_consumer_group,
        value_deserializer=lambda b: json.loads(b.decode()),
        auto_offset_reset="earliest",
        **_kafka_kwargs(),
    )
    await consumer.start()
    log.info("Detector consuming topics: %s", TOPICS)

    try:
        async for msg in consumer:
            try:
                await _process(msg.value, pool, producer)
            except Exception as exc:
                log.exception("Error processing message: %s", exc)
    finally:
        await consumer.stop()
        await producer.stop()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
