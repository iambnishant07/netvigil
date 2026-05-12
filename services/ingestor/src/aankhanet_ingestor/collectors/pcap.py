"""pcap file processor.

Reads a pcap file, extracts per-flow statistics using dpkt, and publishes
each flow to Kafka topic raw.pcap.  Called by the API upload endpoint or
the CLI ingest tool.
"""
from __future__ import annotations

import ipaddress
import logging
import socket
import struct
from collections import defaultdict
from typing import Any

import dpkt

from aankhanet_ingestor import kafka_producer as kp

log = logging.getLogger(__name__)


def _inet(b: bytes) -> str:
    try:
        return socket.inet_ntoa(b)
    except OSError:
        return "0.0.0.0"


FlowKey = tuple[str, str, int, int, int]


def _extract_flows(data: bytes) -> list[dict[str, Any]]:
    try:
        pcap = dpkt.pcap.Reader(data if hasattr(data, "read") else __import__("io").BytesIO(data))
    except Exception as exc:
        log.warning("Cannot parse pcap: %s", exc)
        return []

    flows: dict[FlowKey, dict[str, Any]] = defaultdict(lambda: {
        "bytes": 0, "packets": 0, "proto": 0,
        "src": "0.0.0.0", "dst": "0.0.0.0",
        "sport": 0, "dport": 0,
        "first_ts": 0.0, "last_ts": 0.0,
    })

    for ts, buf in pcap:
        try:
            eth = dpkt.ethernet.Ethernet(buf)
            if not isinstance(eth.data, dpkt.ip.IP):
                continue
            ip = eth.data
            src = _inet(ip.src)
            dst = _inet(ip.dst)
            proto = ip.p
            sport = dport = 0
            if isinstance(ip.data, (dpkt.tcp.TCP, dpkt.udp.UDP)):
                sport = ip.data.sport
                dport = ip.data.dport
            key: FlowKey = (src, dst, sport, dport, proto)
            f = flows[key]
            f["bytes"] += len(buf)
            f["packets"] += 1
            f["proto"] = proto
            f["src"] = src
            f["dst"] = dst
            f["sport"] = sport
            f["dport"] = dport
            if f["first_ts"] == 0.0:
                f["first_ts"] = ts
            f["last_ts"] = ts
        except Exception:
            continue

    return list(flows.values())


async def ingest_file(data: bytes, source_device_id: str) -> int:
    flows = _extract_flows(data)
    for flow in flows:
        flow["device_id"] = source_device_id
        await kp.publish(kp.TOPIC_PCAP, flow)
    log.info("Ingested %d flows from pcap for device %s", len(flows), source_device_id)
    return len(flows)
