"""MITRE ATT&CK technique mapping.

Maps attack labels produced by the XGBoost classifier to ATT&CK technique IDs.
Pin version: MITRE ATT&CK v14 (as per docs/architecture.md).
"""
from __future__ import annotations

# label → (technique_id, severity_floor)
_MAPPING: dict[str, tuple[str, str]] = {
    "port_scan":        ("T1046", "low"),
    "ddos":             ("T1498", "medium"),
    "brute_force":      ("T1110", "medium"),
    "c2_beaconing":     ("T1071", "critical"),
    "data_exfil":       ("T1048", "high"),
    "lateral_movement": ("T1021", "high"),
    "unknown_anomaly":  ("T1059", "info"),
}


def get_technique(label: str) -> str:
    return _MAPPING.get(label, ("T1059", "info"))[0]


def get_severity_floor(label: str) -> str:
    return _MAPPING.get(label, ("T1059", "info"))[1]


def score_to_severity(score: float, label: str) -> str:
    floor = get_severity_floor(label)
    floors = ["info", "low", "medium", "high", "critical"]
    floor_idx = floors.index(floor)

    if score >= 0.95:
        idx = 4
    elif score >= 0.85:
        idx = 3
    elif score >= 0.70:
        idx = 2
    elif score >= 0.50:
        idx = 1
    else:
        idx = 0

    return floors[max(idx, floor_idx)]
