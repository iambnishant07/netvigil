"""NetFlow v9 UDP receiver.

Parses NetFlow v9 packets (RFC 3954) and publishes normalised flow records to
Kafka topic raw.netflow.  Template caching is per-source-IP.
"""
from __future__ import annotations

import asyncio
import logging
import struct
from typing import Any

from netvigil_ingestor import kafka_producer as kp

log = logging.getLogger(__name__)

# Template cache: {src_ip: {template_id: [(field_type, field_length), ...]}}
_templates: dict[str, dict[int, list[tuple[int, int]]]] = {}

# Selected IANA NetFlow v9 field types we care about
_FIELD_NAMES: dict[int, str] = {
    1: "in_bytes", 2: "in_pkts", 4: "protocol", 5: "src_tos",
    6: "tcp_flags", 7: "l4_src_port", 8: "ipv4_src_addr",
    11: "l4_dst_port", 12: "ipv4_dst_addr", 21: "last_switched",
    22: "first_switched", 23: "out_bytes", 32: "icmp_type",
    60: "ip_protocol_version",
}


def _ip4(b: bytes) -> str:
    return ".".join(str(x) for x in b)


def _parse_template(data: bytes, offset: int) -> tuple[int, list[tuple[int, int]], int]:
    template_id, field_count = struct.unpack_from("!HH", data, offset)
    offset += 4
    fields: list[tuple[int, int]] = []
    for _ in range(field_count):
        ft, fl = struct.unpack_from("!HH", data, offset)
        fields.append((ft, fl))
        offset += 4
    return template_id, fields, offset


def _parse_data(
    data: bytes, offset: int, length: int, fields: list[tuple[int, int]], src_ip: str
) -> list[dict[str, Any]]:
    end = offset + length
    record_len = sum(fl for _, fl in fields)
    records = []
    while offset + record_len <= end:
        rec: dict[str, Any] = {"src_router": src_ip}
        for ft, fl in fields:
            raw = data[offset:offset + fl]
            name = _FIELD_NAMES.get(ft, f"field_{ft}")
            if ft in (8, 12) and fl == 4:
                rec[name] = _ip4(raw)
            elif fl <= 8:
                rec[name] = int.from_bytes(raw, "big")
            offset += fl
        records.append(rec)
    return records


def _parse_packet(data: bytes, src_ip: str) -> list[dict[str, Any]]:
    if len(data) < 20:
        return []
    version, count, _sys_uptime, _unix_secs, _seq, source_id = struct.unpack_from("!HHIIII", data, 0)
    if version != 9:
        log.debug("Unsupported NetFlow version %d from %s", version, src_ip)
        return []

    offset = 20
    results: list[dict[str, Any]] = []
    templates = _templates.setdefault(src_ip, {})

    for _ in range(count):
        if offset + 4 > len(data):
            break
        flowset_id, length = struct.unpack_from("!HH", data, offset)
        body_start = offset + 4
        body_end = offset + length
        offset += length

        if flowset_id == 0:  # Template flowset
            pos = body_start
            while pos + 4 < body_end:
                tid, fields, pos = _parse_template(data, pos)
                templates[tid] = fields

        elif flowset_id > 255:  # Data flowset
            if flowset_id in templates:
                records = _parse_data(data, body_start, length - 4, templates[flowset_id], src_ip)
                results.extend(records)

    return results


class _NetFlowProtocol(asyncio.DatagramProtocol):
    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        src_ip = addr[0]
        for record in _parse_packet(data, src_ip):
            asyncio.ensure_future(kp.publish(kp.TOPIC_NETFLOW, record))

    def error_received(self, exc: Exception) -> None:
        log.warning("NetFlow UDP error: %s", exc)


async def serve(host: str, port: int) -> None:
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(
        _NetFlowProtocol, local_addr=(host, port)
    )
    log.info("NetFlow v9 listener on UDP %s:%d", host, port)
    try:
        await asyncio.sleep(float("inf"))
    finally:
        transport.close()
