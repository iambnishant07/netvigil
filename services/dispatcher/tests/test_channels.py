from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aankhanet_dispatcher.channels import email as email_ch
from aankhanet_dispatcher.channels import push as push_ch
from aankhanet_dispatcher.channels import sms as sms_ch


INCIDENT = {
    "id": "abc-123",
    "severity": "critical",
    "attack_label": "port_scan",
    "mitre_technique": "T1046",
    "source_ip": "185.220.101.45",
    "destination_ip": "10.0.0.1",
    "anomaly_score": 0.97,
    "narrative": "A port scan was detected.",
}

RULE = {"name": "Critical → email", "min_severity": "critical", "channel": "email"}


# ── Email channel ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_email_send_calls_aiosmtplib():
    with patch("aankhanet_dispatcher.channels.email.aiosmtplib.send", new_callable=AsyncMock) as mock_send:
        await email_ch.send(INCIDENT, RULE, "analyst@example.com")
    mock_send.assert_awaited_once()
    msg = mock_send.call_args.args[0]
    assert "AankhaNet" in msg["Subject"]
    assert "CRITICAL" in msg["Subject"]


@pytest.mark.asyncio
async def test_email_send_does_not_raise_on_smtp_error():
    with patch("aankhanet_dispatcher.channels.email.aiosmtplib.send", side_effect=Exception("SMTP down")):
        await email_ch.send(INCIDENT, RULE, "analyst@example.com")


@pytest.mark.asyncio
async def test_email_body_contains_key_fields():
    captured = {}

    async def _capture(msg, **kwargs):
        captured["body"] = msg.get_payload()

    with patch("aankhanet_dispatcher.channels.email.aiosmtplib.send", side_effect=_capture):
        await email_ch.send(INCIDENT, RULE, "analyst@example.com")

    body = captured.get("body", "")
    assert "185.220.101.45" in body
    assert "T1046" in body
    assert "0.97" in body


# ── SMS channel ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sms_skips_when_no_credentials(monkeypatch):
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_account_sid", "")
    await sms_ch.send(INCIDENT, "+61400000000")  # should not raise


@pytest.mark.asyncio
async def test_sms_sends_http_request_when_configured(monkeypatch):
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_account_sid", "ACtest")
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_auth_token", "token")
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_from_number", "+15550000")

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("aankhanet_dispatcher.channels.sms.httpx.AsyncClient", return_value=mock_client):
        await sms_ch.send(INCIDENT, "+61400000000")

    mock_client.post.assert_awaited_once()
    call_kwargs = mock_client.post.call_args.kwargs
    body = call_kwargs["data"]["Body"]
    assert "CRITICAL" in body


@pytest.mark.asyncio
async def test_sms_does_not_raise_on_http_error(monkeypatch):
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_account_sid", "ACtest")
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_auth_token", "token")
    monkeypatch.setattr("aankhanet_dispatcher.channels.sms.settings.twilio_from_number", "+15550000")

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=Exception("Twilio down"))

    with patch("aankhanet_dispatcher.channels.sms.httpx.AsyncClient", return_value=mock_client):
        await sms_ch.send(INCIDENT, "+61400000000")


# ── Push channel ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_push_send_calls_expo_api():
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("aankhanet_dispatcher.channels.push.httpx.AsyncClient", return_value=mock_client):
        await push_ch.send(INCIDENT, "ExponentPushToken[test123]")

    mock_client.post.assert_awaited_once()
    payload = mock_client.post.call_args.kwargs["json"]
    assert payload["to"] == "ExponentPushToken[test123]"
    assert "title" in payload
    assert "CRITICAL" in payload["title"]


@pytest.mark.asyncio
async def test_push_does_not_raise_on_http_error():
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(side_effect=Exception("network error"))

    with patch("aankhanet_dispatcher.channels.push.httpx.AsyncClient", return_value=mock_client):
        await push_ch.send(INCIDENT, "ExponentPushToken[test123]")


@pytest.mark.asyncio
async def test_push_priority_high_for_critical():
    captured = {}

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async def _capture(**kwargs):
        captured["json"] = kwargs.get("json", {})
        return mock_response

    mock_client.post = _capture

    with patch("aankhanet_dispatcher.channels.push.httpx.AsyncClient", return_value=mock_client):
        await push_ch.send(INCIDENT, "ExponentPushToken[abc]")

    assert captured["json"]["priority"] == "high"


@pytest.mark.asyncio
async def test_push_priority_normal_for_low():
    low_incident = {**INCIDENT, "severity": "low"}
    captured = {}

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    async def _capture(**kwargs):
        captured["json"] = kwargs.get("json", {})
        return mock_response

    mock_client.post = _capture

    with patch("aankhanet_dispatcher.channels.push.httpx.AsyncClient", return_value=mock_client):
        await push_ch.send(low_incident, "ExponentPushToken[abc]")

    assert captured["json"]["priority"] == "normal"
