from __future__ import annotations

import pytest

from aankhanet_detector.narrative import generate


FEATURES = [
    {"name": "flow_duration", "value": 120.0},
    {"name": "in_bytes", "value": 50000.0},
    {"name": "pkt_rate", "value": 9800.0},
]


@pytest.mark.asyncio
async def test_fallback_when_no_api_key():
    result = await generate(
        label="port_scan",
        src="185.220.101.45",
        dst="10.0.0.1",
        score=0.87,
        severity="high",
        top_features=FEATURES,
        api_key="",
    )
    assert "185.220.101.45" in result
    assert len(result) > 0


@pytest.mark.asyncio
async def test_fallback_contains_dst():
    result = await generate(
        label="ddos",
        src="1.2.3.4",
        dst="192.168.1.100",
        score=0.95,
        severity="critical",
        top_features=FEATURES,
        api_key="",
    )
    assert "192.168.1.100" in result


@pytest.mark.asyncio
@pytest.mark.parametrize("label", [
    "port_scan", "ddos", "brute_force", "c2_beaconing",
    "data_exfil", "lateral_movement", "unknown_anomaly",
])
async def test_all_labels_have_templates(label):
    result = await generate(
        label=label,
        src="1.1.1.1",
        dst="2.2.2.2",
        score=0.5,
        severity="medium",
        top_features=[],
        api_key="",
    )
    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_unknown_label_uses_fallback_template():
    result = await generate(
        label="made_up_label",
        src="10.0.0.1",
        dst="10.0.0.2",
        score=0.5,
        severity="low",
        top_features=[],
        api_key="",
    )
    assert "10.0.0.1" in result


@pytest.mark.asyncio
async def test_invalid_api_key_falls_back_to_template():
    result = await generate(
        label="brute_force",
        src="45.33.32.156",
        dst="192.168.1.22",
        score=0.89,
        severity="high",
        top_features=FEATURES,
        api_key="sk-ant-invalid-key-for-testing",
    )
    assert isinstance(result, str)
    assert len(result) > 0
