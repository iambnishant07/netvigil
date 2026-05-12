from __future__ import annotations

import struct

from aankhanet_ingestor.collectors.netflow import _ip4, _parse_template, _parse_data, _FIELD_NAMES


# ── Helper utilities ──────────────────────────────────────────────────────────

def test_ip4_standard():
    assert _ip4(b"\xc0\xa8\x01\x01") == "192.168.1.1"


def test_ip4_zeros():
    assert _ip4(b"\x00\x00\x00\x00") == "0.0.0.0"


def test_ip4_broadcast():
    assert _ip4(b"\xff\xff\xff\xff") == "255.255.255.255"


def test_ip4_public():
    assert _ip4(b"\x08\x08\x08\x08") == "8.8.8.8"


# ── Template parsing ──────────────────────────────────────────────────────────

def _make_template_bytes(template_id: int, fields: list[tuple[int, int]]) -> bytes:
    """Build a raw template flowset body (without flowset header)."""
    data = struct.pack("!HH", template_id, len(fields))
    for ft, fl in fields:
        data += struct.pack("!HH", ft, fl)
    return data


def test_parse_template_id():
    fields = [(1, 4), (2, 4)]  # IN_BYTES, IN_PKTS, 4 bytes each
    data = _make_template_bytes(256, fields)
    tmpl_id, parsed_fields, _ = _parse_template(data, 0)
    assert tmpl_id == 256


def test_parse_template_field_count():
    fields = [(1, 4), (2, 4), (4, 1)]
    data = _make_template_bytes(257, fields)
    _, parsed_fields, _ = _parse_template(data, 0)
    assert len(parsed_fields) == 3


def test_parse_template_field_types():
    fields = [(1, 4), (4, 1), (6, 1)]   # IN_BYTES, PROTOCOL, TCP_FLAGS
    data = _make_template_bytes(258, fields)
    _, parsed_fields, _ = _parse_template(data, 0)
    assert parsed_fields[0] == (1, 4)
    assert parsed_fields[1] == (4, 1)
    assert parsed_fields[2] == (6, 1)


def test_parse_template_advances_offset():
    fields = [(1, 4), (2, 4)]
    data = _make_template_bytes(256, fields)
    _, _, new_offset = _parse_template(data, 0)
    # 4 bytes header + 2 fields × 4 bytes each = 12
    assert new_offset == 12


# ── Data record parsing ───────────────────────────────────────────────────────

def _make_data_bytes(fields: list[tuple[int, int]], values: list[int]) -> bytes:
    data = b""
    for (ft, fl), val in zip(fields, values):
        data += val.to_bytes(fl, "big")
    return data


def test_parse_data_single_record():
    fields = [(1, 4), (2, 4)]  # IN_BYTES=1000, IN_PKTS=50
    data = _make_data_bytes(fields, [1000, 50])
    records = _parse_data(data, 0, len(data), fields, "10.0.0.1")
    assert len(records) == 1
    assert records[0]["in_bytes"] == 1000
    assert records[0]["in_pkts"] == 50


def test_parse_data_src_router_set():
    fields = [(1, 4)]
    data = _make_data_bytes(fields, [500])
    records = _parse_data(data, 0, len(data), fields, "192.168.1.254")
    assert records[0]["src_router"] == "192.168.1.254"


def test_parse_data_ipv4_field_decoded():
    # field type 8 = ipv4_src_addr (4 bytes)
    fields = [(8, 4)]
    data = struct.pack("!4B", 10, 0, 0, 1)
    records = _parse_data(data, 0, len(data), fields, "router")
    assert records[0]["ipv4_src_addr"] == "10.0.0.1"


def test_parse_data_unknown_field_type_uses_generic_name():
    fields = [(999, 2)]  # unknown field type
    data = (42).to_bytes(2, "big")
    records = _parse_data(data, 0, len(data), fields, "router")
    assert "field_999" in records[0]
    assert records[0]["field_999"] == 42


def test_parse_data_multiple_records():
    fields = [(1, 4), (2, 4)]
    # Two records back-to-back
    data = _make_data_bytes(fields, [100, 10]) + _make_data_bytes(fields, [200, 20])
    records = _parse_data(data, 0, len(data), fields, "router")
    assert len(records) == 2
    assert records[0]["in_bytes"] == 100
    assert records[1]["in_bytes"] == 200


def test_parse_data_truncated_record_ignored():
    fields = [(1, 4), (2, 4)]   # each record = 8 bytes
    # Only 5 bytes — not enough for one full record
    data = b"\x00\x00\x00\x64\x00"
    records = _parse_data(data, 0, len(data), fields, "router")
    assert records == []


# ── Field name map ────────────────────────────────────────────────────────────

def test_field_names_has_common_fields():
    assert _FIELD_NAMES[1]  == "in_bytes"
    assert _FIELD_NAMES[2]  == "in_pkts"
    assert _FIELD_NAMES[4]  == "protocol"
    assert _FIELD_NAMES[6]  == "tcp_flags"
    assert _FIELD_NAMES[7]  == "l4_src_port"
    assert _FIELD_NAMES[8]  == "ipv4_src_addr"
    assert _FIELD_NAMES[11] == "l4_dst_port"
    assert _FIELD_NAMES[12] == "ipv4_dst_addr"
