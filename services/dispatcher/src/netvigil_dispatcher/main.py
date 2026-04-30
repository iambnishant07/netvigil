"""Dispatcher entrypoint.

Consumes incidents.created from Kafka, evaluates alert rules from Postgres,
and fans out to email / SMS / push channels.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import asyncpg
from aiokafka import AIOKafkaConsumer

from netvigil_dispatcher.channels import email as email_ch
from netvigil_dispatcher.channels import push as push_ch
from netvigil_dispatcher.channels import sms as sms_ch
from netvigil_dispatcher.config import settings
from netvigil_dispatcher.evaluator import matching_rules

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

TOPIC = "incidents.created"


async def _load_rules(pool: asyncpg.Pool, org_id: str) -> list[dict[str, Any]]:  # type: ignore[type-arg]
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM alert_rules WHERE organization_id = $1::uuid AND enabled = TRUE",
            org_id,
        )
    return [dict(r) for r in rows]


async def _get_user(pool: asyncpg.Pool, user_id: str) -> dict[str, Any] | None:  # type: ignore[type-arg]
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row) if row else None


async def _dispatch(
    incident: dict[str, Any],
    rule: dict[str, Any],
    pool: asyncpg.Pool,  # type: ignore[type-arg]
) -> None:
    channel = rule["channel"]
    target_uid = rule.get("target_user_id")

    if channel == "email":
        to_addr = ""
        if target_uid:
            u = await _get_user(pool, str(target_uid))
            to_addr = u["email"] if u else ""
        if to_addr:
            await email_ch.send(incident, rule, to_addr)

    elif channel == "sms":
        to_number = settings.twilio_from_number
        await sms_ch.send(incident, to_number)

    elif channel == "push":
        token = settings.expo_access_token
        if token:
            await push_ch.send(incident, token)


async def main() -> None:
    pool: asyncpg.Pool = await asyncpg.create_pool(settings.asyncpg_dsn, min_size=2, max_size=5)  # type: ignore[type-arg]

    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        value_deserializer=lambda b: json.loads(b.decode()),
        auto_offset_reset="earliest",
    )
    await consumer.start()
    log.info("Dispatcher consuming topic: %s", TOPIC)

    try:
        async for msg in consumer:
            incident = msg.value
            org_id = incident.get("organization_id", "")
            if not org_id:
                continue
            rules = await _load_rules(pool, org_id)
            fired = matching_rules(incident, rules)
            for rule in fired:
                try:
                    await _dispatch(incident, rule, pool)
                except Exception as exc:
                    log.exception("Dispatch error for rule %s: %s", rule["id"], exc)
    finally:
        await consumer.stop()
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
