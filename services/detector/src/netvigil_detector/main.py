"""Detector entrypoint.

Consumes raw.syslog, raw.netflow, raw.pcap from Kafka.
For each flow: extract features → score ensemble → map MITRE → generate
narrative → write incident to Postgres + flow metric to InfluxDB.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import asyncpg
from aiokafka import AIOKafkaConsumer

from netvigil_detector import ensemble, mitre, narrative, writer
from netvigil_detector.config import settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

TOPICS = ["raw.syslog", "raw.netflow", "raw.pcap"]


async def _process(
    record: dict[str, Any],
    pool: asyncpg.Pool,  # type: ignore[type-arg]
) -> None:
    org_id    = record.get("org_id", "")
    device_id = record.get("device_id", "")
    if not org_id or not device_id:
        return

    await writer.write_flow_metric(record, device_id)

    score, label, top_features = ensemble.score(record)
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

    await writer.write_incident(
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


async def main() -> None:
    ensemble.load_models()

    pool: asyncpg.Pool = await asyncpg.create_pool(settings.asyncpg_dsn, min_size=2, max_size=10)  # type: ignore[type-arg]

    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        value_deserializer=lambda b: json.loads(b.decode()),
        auto_offset_reset="earliest",
    )
    await consumer.start()
    log.info("Detector consuming topics: %s", TOPICS)

    try:
        async for msg in consumer:
            try:
                await _process(msg.value, pool)
            except Exception as exc:
                log.exception("Error processing message: %s", exc)
    finally:
        await consumer.stop()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
