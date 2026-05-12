#!/usr/bin/env python3
"""Seed the AankhaNet pipeline with synthetic events.

Publishes one test NetFlow record directly to Kafka so the full chain runs:
  Kafka (raw.netflow) → detector → Postgres + InfluxDB + Kafka (incidents.created)
                                                         → dispatcher → push/email

Usage:
    pip install confluent-kafka python-dotenv
    python scripts/seed_pipeline.py

Reads credentials from .env in the repo root, or from environment variables.
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid

try:
    from confluent_kafka import Producer
except ImportError:
    print("Run: pip install confluent-kafka")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional

BOOTSTRAP  = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "pkc-4n66v.australiaeast.azure.confluent.cloud:9092")
USERNAME   = os.environ.get("KAFKA_SASL_USERNAME",  "KGRXHEZEQ2YKYECX")
PASSWORD   = os.environ.get("KAFKA_SASL_PASSWORD",  "cfltkcuqleYgWNckCFTSIbLdLu7PuT93PNdjiQfMwRFmCEeZQ/ItpPCxmW2ozBAw")
ORG_ID     = os.environ.get("SEED_ORG_ID", "")       # paste a real org UUID from your DB
DEVICE_ID  = os.environ.get("SEED_DEVICE_ID", "")    # paste a real device UUID from your DB

if not ORG_ID or not DEVICE_ID:
    print(
        "\nERROR: Set SEED_ORG_ID and SEED_DEVICE_ID before running.\n"
        "  Get them from your Neon DB:\n"
        "    SELECT id FROM organizations LIMIT 1;\n"
        "    SELECT id FROM devices LIMIT 1;\n"
    )
    sys.exit(1)

now = time.time()

# A NetFlow-style record that features.py knows how to parse
record = {
    "org_id":          ORG_ID,
    "device_id":       DEVICE_ID,
    "ipv4_src_addr":   "10.0.0.55",
    "ipv4_dst_addr":   "185.220.101.45",   # known Tor exit node range — looks suspicious
    "l4_src_port":     52341,
    "l4_dst_port":     443,
    "protocol":        6,                  # TCP
    "in_bytes":        1_200_000,          # 1.2 MB — large outbound
    "out_bytes":       8_000,
    "in_pkts":         900,
    "out_pkts":        60,
    "tcp_flags":       0x02,               # SYN
    "first_ts":        now - 30,
    "last_ts":         now,
}

producer = Producer({
    "bootstrap.servers":       BOOTSTRAP,
    "security.protocol":       "SASL_SSL",
    "sasl.mechanism":          "PLAIN",
    "sasl.username":           USERNAME,
    "sasl.password":           PASSWORD,
})


def _delivery(err: object, msg: object) -> None:
    if err:
        print(f"  ✗ delivery failed: {err}")
    else:
        print(f"  OK delivered to {msg.topic()} [{msg.partition()}] offset {msg.offset()}")  # type: ignore[union-attr]


print("Publishing test NetFlow event to raw.netflow ...")
producer.produce("raw.netflow", json.dumps(record).encode(), callback=_delivery)
producer.flush(timeout=10)
print("\nDone. Watch the detector + dispatcher Railway logs for processing.")
