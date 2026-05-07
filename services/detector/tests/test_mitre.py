from __future__ import annotations

import pytest

from netvigil_detector.mitre import get_technique, get_severity_floor, score_to_severity


# ── get_technique ──────────────────────────────────────────────────────────────

def test_known_labels():
    assert get_technique("port_scan")        == "T1046"
    assert get_technique("ddos")             == "T1498"
    assert get_technique("brute_force")      == "T1110"
    assert get_technique("c2_beaconing")     == "T1071"
    assert get_technique("data_exfil")       == "T1048"
    assert get_technique("lateral_movement") == "T1021"
    assert get_technique("unknown_anomaly")  == "T1059"


def test_unknown_label_falls_back():
    assert get_technique("totally_made_up") == "T1059"


# ── get_severity_floor ────────────────────────────────────────────────────────

def test_severity_floors():
    assert get_severity_floor("port_scan")        == "low"
    assert get_severity_floor("ddos")             == "medium"
    assert get_severity_floor("brute_force")      == "medium"
    assert get_severity_floor("c2_beaconing")     == "critical"
    assert get_severity_floor("data_exfil")       == "high"
    assert get_severity_floor("lateral_movement") == "high"
    assert get_severity_floor("unknown_anomaly")  == "info"


# ── score_to_severity ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("score,label,expected", [
    (0.97, "port_scan",    "critical"),   # score ≥ 0.95 → critical, floor low → critical
    (0.90, "port_scan",    "high"),       # score bucket high, floor low → high
    (0.75, "port_scan",    "medium"),     # score bucket medium, floor low → medium
    (0.55, "port_scan",    "low"),        # score bucket low, floor low → low
    (0.30, "port_scan",    "low"),        # score bucket info, but floor is low → low
    (0.30, "unknown_anomaly", "info"),    # score low, floor info
    (0.10, "c2_beaconing", "critical"),  # floor critical overrides low score
    (0.90, "c2_beaconing", "critical"),  # both high
    (0.55, "data_exfil",   "high"),      # floor high overrides medium bucket
])
def test_score_to_severity(score, label, expected):
    assert score_to_severity(score, label) == expected


def test_unknown_label_defaults_to_info_floor():
    result = score_to_severity(0.1, "nonexistent_label")
    assert result == "info"
