from __future__ import annotations

from aankhanet_ingestor.collectors.syslog import _parse


# ── RFC 5424 ──────────────────────────────────────────────────────────────────

def test_rfc5424_src_ip_preserved():
    raw = b"<134>1 2024-01-15T12:00:00Z firewall.local pfSense 1234 - - Connection established"
    result = _parse(raw, "192.168.1.1")
    assert result["src_ip"] == "192.168.1.1"


def test_rfc5424_priority_parsed():
    raw = b"<134>1 2024-01-15T12:00:00Z firewall.local pfSense 1234 - - msg"
    result = _parse(raw, "10.0.0.1")
    assert "pri" in result
    assert result["pri"] == "134"


def test_rfc5424_host_parsed():
    raw = b"<13>1 2024-01-15T12:00:00Z myrouter.local sshd 999 - - Login failed"
    result = _parse(raw, "10.0.0.2")
    assert result.get("host") == "myrouter.local"


def test_rfc5424_message_included():
    raw = b"<13>1 2024-01-15T12:00:00Z host app 1 - - this is the message"
    result = _parse(raw, "1.2.3.4")
    assert "this is the message" in result.get("msg", "") or "this is the message" in result.get("raw", "")


# ── RFC 3164 ──────────────────────────────────────────────────────────────────

def test_rfc3164_src_ip_preserved():
    raw = b"<30>Jan  1 00:00:00 hostname sshd: Invalid user admin from 1.2.3.4"
    result = _parse(raw, "10.0.0.5")
    assert result["src_ip"] == "10.0.0.5"


def test_rfc3164_host_parsed():
    raw = b"<30>Jan  1 12:34:56 myhost kernel: some kernel message"
    result = _parse(raw, "172.16.0.1")
    assert result.get("host") == "myhost"


def test_rfc3164_priority_parsed():
    raw = b"<86>Jan 15 08:00:00 router syslog: test"
    result = _parse(raw, "10.1.1.1")
    assert result.get("pri") == "86"


# ── Fallback ──────────────────────────────────────────────────────────────────

def test_non_syslog_message_returns_raw():
    raw = b"this is not a syslog message at all"
    result = _parse(raw, "5.6.7.8")
    assert result["src_ip"] == "5.6.7.8"
    assert "raw" in result
    assert "this is not a syslog" in result["raw"]


def test_empty_message_does_not_crash():
    result = _parse(b"", "1.1.1.1")
    assert result["src_ip"] == "1.1.1.1"


def test_binary_garbage_does_not_crash():
    result = _parse(b"\xff\xfe\x00\x01\x02\x03", "9.9.9.9")
    assert result["src_ip"] == "9.9.9.9"


def test_raw_always_present():
    raw = b"<134>1 2024-01-15T12:00:00Z h app 1 - - msg"
    result = _parse(raw, "10.0.0.1")
    assert "raw" in result
