from __future__ import annotations

import numpy as np
import pytest

from aankhanet_detector.features import N_FEATURES, FEATURE_NAMES, extract


def _flow(**kwargs):
    base = {
        "first_ts": 0.0, "last_ts": 1.0,
        "in_bytes": 1000, "out_bytes": 200,
        "in_pkts": 10, "out_pkts": 5,
        "protocol": 6, "l4_src_port": 54321, "l4_dst_port": 443,
        "tcp_flags": 2,
    }
    base.update(kwargs)
    return base


def test_output_shape():
    feat = extract(_flow())
    assert feat.shape == (N_FEATURES,)
    assert feat.dtype == np.float32


def test_feature_names_length():
    assert len(FEATURE_NAMES) == N_FEATURES


def test_duration_milliseconds():
    feat = extract(_flow(first_ts=0.0, last_ts=2.5))
    assert feat[0] == pytest.approx(2500.0)


def test_duration_negative_clamped_to_zero():
    feat = extract(_flow(first_ts=5.0, last_ts=3.0))
    assert feat[0] == 0.0


def test_in_bytes():
    feat = extract(_flow(in_bytes=9999))
    assert feat[1] == pytest.approx(9999.0)


def test_out_bytes():
    feat = extract(_flow(out_bytes=500))
    assert feat[2] == pytest.approx(500.0)


def test_bytes_per_packet():
    # 1000 bytes / 10 packets = 100.0
    feat = extract(_flow(in_bytes=1000, in_pkts=10))
    assert feat[5] == pytest.approx(100.0)


def test_bytes_per_packet_zero_packets_no_div_error():
    feat = extract(_flow(in_pkts=0))
    assert np.isfinite(feat[5])


def test_protocol_field():
    feat = extract(_flow(protocol=17))   # UDP
    assert feat[8] == pytest.approx(17.0)


def test_fallback_proto_field():
    # When "protocol" absent, falls back to "proto"
    record = {"first_ts": 0.0, "last_ts": 1.0, "proto": 17}
    feat = extract(record)
    assert feat[8] == pytest.approx(17.0)


def test_src_port():
    feat = extract(_flow(l4_src_port=12345))
    assert feat[9] == pytest.approx(12345.0)


def test_dst_port():
    feat = extract(_flow(l4_dst_port=80))
    assert feat[10] == pytest.approx(80.0)


def test_tcp_flags():
    feat = extract(_flow(tcp_flags=18))  # SYN+ACK
    assert feat[11] == pytest.approx(18.0)


def test_fallback_bytes_field():
    record = {"first_ts": 0.0, "last_ts": 1.0, "bytes": 500, "packets": 5}
    feat = extract(record)
    assert feat[1] == pytest.approx(500.0)
    assert feat[3] == pytest.approx(5.0)


def test_all_finite():
    feat = extract(_flow())
    assert np.all(np.isfinite(feat))
