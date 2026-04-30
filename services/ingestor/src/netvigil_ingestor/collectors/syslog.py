"""UDP Syslog receiver (RFC 5424 / RFC 3164).

Listens on UDP 514, parses messages, and publishes each event to Kafka topic
raw.syslog.  Each message includes the source IP so the detector can correlate
it with a registered device.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from netvigil_ingestor import kafka_producer as kp

log = logging.getLogger(__name__)

# Minimal RFC 5424 pattern — accepts most vendor variants
_RFC5424 = re.compile(
    r"<(?P<pri>\d+)>\d+\s+"
    r"(?P<ts>\S+)\s+(?P<host>\S+)\s+(?P<app>\S+)\s+\S+\s+\S+\s+-\s+(?P<msg>.*)"
)
_RFC3164 = re.compile(r"<(?P<pri>\d+)>(?P<ts>[A-Za-z]{3}\s+\d+\s+\d+:\d+:\d+)\s+(?P<host>\S+)\s+(?P<msg>.*)")


def _parse(raw: bytes, src_ip: str) -> dict[str, Any]:
    text = raw.decode(errors="replace")
    for pattern in (_RFC5424, _RFC3164):
        m = pattern.match(text)
        if m:
            d = m.groupdict()
            d["raw"] = text
            d["src_ip"] = src_ip
            return d
    return {"raw": text, "src_ip": src_ip}


class _SyslogProtocol(asyncio.DatagramProtocol):
    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        src_ip = addr[0]
        event = _parse(data, src_ip)
        asyncio.ensure_future(kp.publish(kp.TOPIC_SYSLOG, event))

    def error_received(self, exc: Exception) -> None:
        log.warning("Syslog UDP error: %s", exc)


async def serve(host: str, port: int) -> None:
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(
        _SyslogProtocol, local_addr=(host, port)
    )
    log.info("Syslog listener on UDP %s:%d", host, port)
    try:
        await asyncio.sleep(float("inf"))
    finally:
        transport.close()
