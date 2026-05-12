"""Alert rule evaluation.

Given an incident event and a list of alert rules, returns the subset of rules
that match the incident.  Idempotency is enforced by the caller via a
deduplication key stored in Redis / Postgres.
"""
from __future__ import annotations

from typing import Any

_SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]


def _severity_ge(incident_sev: str, min_sev: str) -> bool:
    try:
        return _SEVERITY_ORDER.index(incident_sev) >= _SEVERITY_ORDER.index(min_sev)
    except ValueError:
        return False


def matching_rules(
    incident: dict[str, Any],
    rules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return rules that fire for the given incident."""
    matched = []
    for rule in rules:
        if not rule.get("enabled", True):
            continue
        if not _severity_ge(incident["severity"], rule["min_severity"]):
            continue
        mitre_filter: list[str] = rule.get("mitre_filter") or []
        if mitre_filter and incident.get("mitre_technique") not in mitre_filter:
            continue
        matched.append(rule)
    return matched
