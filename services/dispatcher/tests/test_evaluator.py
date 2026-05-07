from __future__ import annotations

import pytest

from netvigil_dispatcher.evaluator import matching_rules


def _incident(severity: str = "high", mitre: str = "T1046") -> dict:
    return {"severity": severity, "mitre_technique": mitre}


def _rule(min_severity: str = "medium", enabled: bool = True, mitre_filter: list | None = None) -> dict:
    r: dict = {"min_severity": min_severity, "enabled": enabled}
    if mitre_filter is not None:
        r["mitre_filter"] = mitre_filter
    return r


# ── Severity threshold ────────────────────────────────────────────────────────

def test_incident_meets_min_severity():
    assert len(matching_rules(_incident("high"), [_rule("medium")])) == 1


def test_incident_exactly_meets_min_severity():
    assert len(matching_rules(_incident("medium"), [_rule("medium")])) == 1


def test_incident_below_min_severity():
    assert len(matching_rules(_incident("low"), [_rule("medium")])) == 0


def test_critical_matches_all_thresholds():
    rules = [_rule("info"), _rule("low"), _rule("medium"), _rule("high"), _rule("critical")]
    assert len(matching_rules(_incident("critical"), rules)) == 5


def test_info_matches_only_info_threshold():
    rules = [_rule("info"), _rule("low"), _rule("medium")]
    assert len(matching_rules(_incident("info"), rules)) == 1


# ── Enabled flag ──────────────────────────────────────────────────────────────

def test_disabled_rule_skipped():
    assert matching_rules(_incident("critical"), [_rule(enabled=False)]) == []


def test_mixed_enabled_disabled():
    rules = [_rule("low", enabled=True), _rule("low", enabled=False)]
    result = matching_rules(_incident("high"), rules)
    assert len(result) == 1
    assert result[0]["enabled"] is True


# ── MITRE filter ──────────────────────────────────────────────────────────────

def test_mitre_filter_match():
    rule = _rule("low", mitre_filter=["T1046"])
    assert len(matching_rules(_incident("high", "T1046"), [rule])) == 1


def test_mitre_filter_no_match():
    rule = _rule("low", mitre_filter=["T1110"])
    assert len(matching_rules(_incident("high", "T1046"), [rule])) == 0


def test_empty_mitre_filter_matches_all():
    rule = _rule("low", mitre_filter=[])
    assert len(matching_rules(_incident("high", "T1046"), [rule])) == 1


def test_no_mitre_filter_key_matches_all():
    # Rule dict has no mitre_filter key at all
    rule = {"min_severity": "low", "enabled": True}
    assert len(matching_rules(_incident("high", "T1046"), [rule])) == 1


def test_mitre_filter_multiple_techniques():
    rule = _rule("low", mitre_filter=["T1046", "T1110", "T1498"])
    assert len(matching_rules(_incident("high", "T1110"), [rule])) == 1
    assert len(matching_rules(_incident("high", "T1071"), [rule])) == 0


# ── Edge cases ────────────────────────────────────────────────────────────────

def test_empty_rules_list():
    assert matching_rules(_incident("critical"), []) == []


def test_unknown_severity_does_not_crash():
    result = matching_rules(_incident("extreme"), [_rule("medium")])
    assert isinstance(result, list)


@pytest.mark.parametrize("sev", ["info", "low", "medium", "high", "critical"])
def test_all_severity_levels_processable(sev):
    rules = [_rule("info")]
    result = matching_rules(_incident(sev), rules)
    assert isinstance(result, list)
