"""Tests for main.py Kafka consumer logic and writer.py persistence layer."""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aankhanet_detector import main as det_main
from aankhanet_detector import writer


# ── _kafka_kwargs ─────────────────────────────────────────────────────────────

def test_kafka_kwargs_plaintext(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(det_main.settings, "kafka_security_protocol", "PLAINTEXT")
    monkeypatch.setattr(det_main.settings, "kafka_bootstrap_servers", "localhost:9092")
    kwargs = det_main._kafka_kwargs()
    assert kwargs["bootstrap_servers"] == "localhost:9092"
    assert "security_protocol" not in kwargs


def test_kafka_kwargs_sasl_ssl(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(det_main.settings, "kafka_security_protocol", "SASL_SSL")
    monkeypatch.setattr(det_main.settings, "kafka_bootstrap_servers", "broker:9092")
    monkeypatch.setattr(det_main.settings, "kafka_sasl_mechanism", "PLAIN")
    monkeypatch.setattr(det_main.settings, "kafka_sasl_username", "user")
    monkeypatch.setattr(det_main.settings, "kafka_sasl_password", "pass")
    with patch("ssl.create_default_context"):
        kwargs = det_main._kafka_kwargs()
    assert kwargs["security_protocol"] == "SASL_SSL"
    assert kwargs["sasl_mechanism"] == "PLAIN"
    assert kwargs["sasl_plain_username"] == "user"
    assert kwargs["sasl_plain_password"] == "pass"


# ── _process ──────────────────────────────────────────────────────────────────

def _run(coro: Any) -> Any:
    return asyncio.get_event_loop().run_until_complete(coro)


def test_process_skips_missing_org_id() -> None:
    pool = MagicMock()
    producer = MagicMock()
    _run(det_main._process({"device_id": "dev1"}, pool, producer))
    pool.acquire.assert_not_called()


def test_process_skips_missing_device_id() -> None:
    pool = MagicMock()
    producer = MagicMock()
    _run(det_main._process({"org_id": "org1"}, pool, producer))
    pool.acquire.assert_not_called()


@patch("aankhanet_detector.main.writer.write_flow_metric", new_callable=AsyncMock)
@patch("aankhanet_detector.main.writer.write_incident", new_callable=AsyncMock)
@patch("aankhanet_detector.main.narrative.generate", new_callable=AsyncMock)
@patch("aankhanet_detector.main.ensemble.score")
@patch("aankhanet_detector.main.mitre.score_to_severity")
@patch("aankhanet_detector.main.mitre.get_technique")
def test_process_full_flow_with_incident(
    mock_get_tech: MagicMock,
    mock_severity: MagicMock,
    mock_score: MagicMock,
    mock_narr: AsyncMock,
    mock_write_incident: AsyncMock,
    mock_write_flow: AsyncMock,
) -> None:
    mock_get_tech.return_value = "T1046"
    mock_severity.return_value = "high"
    mock_score.return_value = (0.85, "port_scan", [{"name": "dst_port", "value": 22.0}])
    mock_narr.return_value = "Port scan detected from 1.2.3.4"
    mock_write_incident.return_value = "inc-id-123"

    producer = AsyncMock()
    pool = MagicMock()

    record = {
        "org_id": "org1",
        "device_id": "dev1",
        "ipv4_src_addr": "1.2.3.4",
        "ipv4_dst_addr": "10.0.0.1",
    }
    _run(det_main._process(record, pool, producer))

    mock_write_flow.assert_awaited_once()
    mock_write_incident.assert_awaited_once()
    producer.send_and_wait.assert_awaited_once()
    sent_topic = producer.send_and_wait.call_args[0][0]
    assert sent_topic == det_main.INCIDENT_TOPIC


@patch("aankhanet_detector.main.writer.write_flow_metric", new_callable=AsyncMock)
@patch("aankhanet_detector.main.writer.write_incident", new_callable=AsyncMock)
@patch("aankhanet_detector.main.narrative.generate", new_callable=AsyncMock)
@patch("aankhanet_detector.main.ensemble.score")
@patch("aankhanet_detector.main.mitre.score_to_severity")
@patch("aankhanet_detector.main.mitre.get_technique")
def test_process_no_publish_when_incident_not_written(
    mock_get_tech: MagicMock,
    mock_severity: MagicMock,
    mock_score: MagicMock,
    mock_narr: AsyncMock,
    mock_write_incident: AsyncMock,
    mock_write_flow: AsyncMock,
) -> None:
    mock_get_tech.return_value = "T1046"
    mock_severity.return_value = "low"
    mock_score.return_value = (0.2, "unknown_anomaly", [])
    mock_narr.return_value = None
    mock_write_incident.return_value = None  # below threshold

    producer = AsyncMock()
    pool = MagicMock()

    record = {"org_id": "org1", "device_id": "dev1"}
    _run(det_main._process(record, pool, producer))

    mock_write_flow.assert_awaited_once()
    producer.send_and_wait.assert_not_awaited()


# ── writer.write_incident ────────────────────────────────────────────────────

def test_write_incident_below_threshold() -> None:
    pool = MagicMock()
    result = _run(writer.write_incident(
        pool=pool, org_id="o", device_id="d",
        record={}, anomaly_score=0.1,
        attack_label="ddos", mitre_technique="T1498",
        severity="low", narrative=None, top_features=[],
    ))
    assert result is None
    pool.acquire.assert_not_called()


def test_write_incident_above_threshold() -> None:
    conn = AsyncMock()
    conn.execute = AsyncMock()
    pool = MagicMock()
    pool.acquire.return_value.__aenter__ = AsyncMock(return_value=conn)
    pool.acquire.return_value.__aexit__ = AsyncMock(return_value=False)

    result = _run(writer.write_incident(
        pool=pool, org_id="org-uuid", device_id="dev-uuid",
        record={"ipv4_src_addr": "1.2.3.4", "ipv4_dst_addr": "5.6.7.8"},
        anomaly_score=0.9,
        attack_label="port_scan", mitre_technique="T1046",
        severity="high", narrative="Scan detected", top_features=[],
    ))
    assert result is not None
    conn.execute.assert_awaited_once()
    # Verify the INSERT statement was called with the right score
    call_args = conn.execute.call_args[0]
    assert 0.9 == pytest.approx(call_args[9])


# ── writer.write_flow_metric ─────────────────────────────────────────────────

def test_write_flow_metric_success() -> None:
    write_api = AsyncMock()
    write_api.write = AsyncMock()
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.write_api = MagicMock(return_value=write_api)

    with patch("aankhanet_detector.writer.InfluxDBClientAsync", return_value=client):
        _run(writer.write_flow_metric(
            {"in_bytes": 500, "in_pkts": 10}, "dev1"
        ))
    write_api.write.assert_awaited_once()


def test_write_flow_metric_exception_swallowed() -> None:
    client = AsyncMock()
    client.__aenter__ = AsyncMock(side_effect=ConnectionError("refused"))

    with patch("aankhanet_detector.writer.InfluxDBClientAsync", return_value=client):
        # Should not raise
        _run(writer.write_flow_metric({}, "dev1"))


def test_write_flow_metric_fallback_keys() -> None:
    write_api = AsyncMock()
    write_api.write = AsyncMock()
    client = AsyncMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.write_api = MagicMock(return_value=write_api)

    with patch("aankhanet_detector.writer.InfluxDBClientAsync", return_value=client):
        _run(writer.write_flow_metric(
            {"bytes": 100, "packets": 5}, "dev2"
        ))
    write_api.write.assert_awaited_once()
    point_str = write_api.write.call_args[1]["record"]
    assert "bytes=100i" in point_str
    assert "packets=5i" in point_str
