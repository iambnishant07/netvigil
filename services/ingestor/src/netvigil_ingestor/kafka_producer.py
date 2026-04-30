from __future__ import annotations

import json
from typing import Any

from aiokafka import AIOKafkaProducer

from netvigil_ingestor.config import settings

_producer: AIOKafkaProducer | None = None

TOPIC_SYSLOG  = "raw.syslog"
TOPIC_NETFLOW = "raw.netflow"
TOPIC_PCAP    = "raw.pcap"


async def start() -> None:
    global _producer
    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        value_serializer=lambda v: json.dumps(v).encode(),
    )
    await _producer.start()


async def stop() -> None:
    if _producer:
        await _producer.stop()


async def publish(topic: str, payload: dict[str, Any]) -> None:
    assert _producer is not None
    await _producer.send_and_wait(topic, payload)
