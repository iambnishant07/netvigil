"""Dispatcher entrypoint.

Consumes incidents.created from Kafka, evaluates alert rules from Postgres,
and fans out to email / SMS / push channels.
"""
from __future__ import annotations

import asyncio
import json
import logging
import ssl
from typing import Any

import asyncpg
from aiokafka import AIOKafkaConsumer

from aankhanet_dispatcher.channels import email as email_ch
from aankhanet_dispatcher.channels import push as push_ch
from aankhanet_dispatcher.channels import sms as sms_ch
from aankhanet_dispatcher.config import settings
from aankhanet_dispatcher.evaluator import matching_rules


def _kafka_kwargs() -> dict[str, object]:
    kwargs: dict[str, object] = {
        "bootstrap_servers": settings.kafka_bootstrap_servers,
        "value_deserializer": lambda b: json.loads(b.decode()),
        "auto_offset_reset": "earliest",
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
        if target_uid:
            u = await _get_user(pool, str(target_uid))
            device_token = (u or {}).get("expo_push_token") if u else None
            if device_token:
                await push_ch.send(incident, device_token)


async def _make_pool() -> asyncpg.Pool:  # type: ignore[return]
    dsn = settings.asyncpg_dsn
    if "neon.tech" in dsn or "sslmode" in dsn:
        import urllib.parse as _up
        clean = dsn.split("?")[0]
        return await asyncpg.create_pool(clean, ssl=ssl.create_default_context(), min_size=1, max_size=5, statement_cache_size=0)  # type: ignore[return-value]
    return await asyncpg.create_pool(dsn, min_size=1, max_size=5)  # type: ignore[return-value]


async def main() -> None:
    pool: asyncpg.Pool = await _make_pool()  # type: ignore[type-arg]

    consumer = AIOKafkaConsumer(
        TOPIC,
        group_id=settings.kafka_consumer_group,
        **_kafka_kwargs(),
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
