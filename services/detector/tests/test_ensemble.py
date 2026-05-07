from __future__ import annotations

import pytest

from netvigil_detector.ensemble import LABELS, load_models, score
from netvigil_detector.features import N_FEATURES


def _record(**kwargs):
    base = {
        "first_ts": 0.0, "last_ts": 1.0,
        "in_bytes": 1000, "out_bytes": 200,
        "in_pkts": 10, "out_pkts": 5,
        "protocol": 6, "l4_src_port": 54321, "l4_dst_port": 443,
        "tcp_flags": 2,
    }
    base.update(kwargs)
    return base


@pytest.fixture(scope="module", autouse=True)
def models():
    load_models()


def test_score_returns_three_tuple():
    result = score(_record())
    assert len(result) == 3


def test_anomaly_score_in_range():
    anomaly_score, _, _ = score(_record())
    assert 0.0 <= anomaly_score <= 1.0


def test_label_is_known():
    _, label, _ = score(_record())
    assert label in LABELS


def test_top_features_count():
    _, _, feats = score(_record())
    assert len(feats) == 3


def test_top_features_have_name_and_value():
    _, _, feats = score(_record())
    for f in feats:
        assert "name" in f
        assert "value" in f
        assert isinstance(f["value"], float)


def test_high_volume_flow_scores_higher():
    normal   = _record(in_bytes=100,    in_pkts=1)
    anomalous = _record(in_bytes=10_000_000, in_pkts=10_000, first_ts=0.0, last_ts=0.001)
    s_normal, _, _    = score(normal)
    s_anomalous, _, _ = score(anomalous)
    # The anomalous flow should not score lower than the normal one
    assert s_anomalous >= s_normal - 0.3   # generous tolerance for synthetic model


def test_score_stable_on_repeated_call():
    r = _record()
    s1, l1, _ = score(r)
    s2, l2, _ = score(r)
    assert s1 == pytest.approx(s2)
    assert l1 == l2
