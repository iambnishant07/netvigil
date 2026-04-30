"""Feature extraction from raw flow records.

Converts ingestor-published flow dicts into a fixed-length numpy feature
vector suitable for the AI ensemble.  Features align with the CICIDS2017
dataset schema (Engelen et al. 2021 cleaned version).
"""
from __future__ import annotations

from typing import Any

import numpy as np


FEATURE_NAMES = [
    "duration_ms",
    "in_bytes",
    "out_bytes",
    "in_pkts",
    "out_pkts",
    "bytes_per_pkt",
    "pkt_rate",
    "byte_rate",
    "protocol",
    "src_port",
    "dst_port",
    "tcp_flags",
]

N_FEATURES = len(FEATURE_NAMES)


def extract(record: dict[str, Any]) -> np.ndarray:
    """Return a (N_FEATURES,) float32 array from a raw flow record."""
    dur_ms = max(0.0, (record.get("last_ts", 0.0) - record.get("first_ts", 0.0)) * 1000)
    in_b   = float(record.get("in_bytes",  record.get("bytes",   0)))
    out_b  = float(record.get("out_bytes", 0))
    in_p   = float(record.get("in_pkts",   record.get("packets", 1)))
    out_p  = float(record.get("out_pkts",  0))
    bpp    = in_b / max(in_p, 1)
    pkt_r  = in_p / max(dur_ms / 1000, 1e-6)
    byt_r  = in_b / max(dur_ms / 1000, 1e-6)

    return np.array([
        dur_ms,
        in_b,
        out_b,
        in_p,
        out_p,
        bpp,
        pkt_r,
        byt_r,
        float(record.get("protocol", record.get("proto", 6))),
        float(record.get("l4_src_port", record.get("sport", 0))),
        float(record.get("l4_dst_port", record.get("dport", 0))),
        float(record.get("tcp_flags", 0)),
    ], dtype=np.float32)
