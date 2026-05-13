from __future__ import annotations

import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query

from aankhanet_api import database as db
from aankhanet_api.deps import require_permission
from aankhanet_api.repositories import incidents as inc_repo
from aankhanet_api.schemas.dashboard import (
    AttackTypes,
    DashboardKpis,
    GeoPoint,
    IpBytes,
    IpBytesCountry,
    SeverityCount,
    ThreatArc,
    ThreatMap,
    TrendData,
    TrendDay,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_ReadDashboard = Annotated[dict[str, Any], require_permission("dashboard:read")]

# ─── IP geo lookup ────────────────────────────────────────────────────────────
# Keyed on first two octets → (lat, lng, country).
# Covers the ranges that appear in seed data and common attacker blocks.
_IP_GEO: dict[str, tuple[float, float, str]] = {
    "185.220": (50.1,   8.7,   "DE"),  # Tor exits — Frankfurt
    "185.156": (55.7,  37.6,   "RU"),
    "103.74":  (22.3,  114.2,  "HK"),
    "222.186": (30.6,  114.3,  "CN"),
    "101.33":  (39.9,  116.4,  "CN"),
    "125.124": (31.2,  121.5,  "CN"),
    "58.218":  (32.0,  118.8,  "CN"),
    "194.165": (50.1,   14.4,  "CZ"),
    "45.33":   (37.8, -122.4,  "US"),
    "104.21":  (37.4, -122.1,  "US"),
    "2.56":    (52.3,    4.9,  "NL"),
    "91.108":  (52.3,    4.9,  "NL"),
    "92.242":  (55.7,   37.6,  "RU"),
    "45.142":  (48.2,   16.4,  "AT"),
    "197.210": ( 9.1,    7.5,  "NG"),
    "1.179":   (-33.9,  151.2, "AU"),
    "203.206": (-37.8,  145.0, "AU"),
    # IANA documentation ranges — used in seed data; map to plausible locations
    "198.51":  (35.7,  139.7,  "JP"),
    "203.0":   ( 1.4,  103.8,  "SG"),
}

# RFC-1918 prefixes — used to classify IPs as internal/external
_RFC1918_PREFIXES = (
    "10.", "192.168.",
    "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
    "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
)


def _is_private(ip: str) -> bool:
    return any(ip.startswith(p) for p in _RFC1918_PREFIXES)


def _ip_to_geo(ip: str) -> tuple[float, float, str] | None:
    prefix = ".".join(ip.split(".")[:2])
    return _IP_GEO.get(prefix)


def _country_for(ip: str) -> str:
    geo = _ip_to_geo(ip)
    return geo[2] if geo else "??"


# ─── /kpis ───────────────────────────────────────────────────────────────────

@router.get("/kpis", response_model=DashboardKpis, response_model_by_alias=True)
async def get_kpis(current_user: _ReadDashboard) -> DashboardKpis:
    async with db.get_connection() as conn:
        await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", current_user["org"])

        sev_counts = await inc_repo.get_kpis(conn, current_user["org"])

        # Top internal talkers: internal source IPs by incident count.
        # anomaly_score * 5 GB used as a traffic-volume proxy (no netflow table).
        internal_rows = await conn.fetch(
            """
            SELECT source_ip,
                   count(*)::int                           AS cnt,
                   (sum(anomaly_score) * 500000000)::bigint AS est_bytes
            FROM incidents
            WHERE organization_id = $1::uuid
              AND (
                source_ip LIKE '10.%%'       OR
                source_ip LIKE '192.168.%%'  OR
                source_ip LIKE '172.16.%%'   OR source_ip LIKE '172.17.%%' OR
                source_ip LIKE '172.18.%%'   OR source_ip LIKE '172.19.%%' OR
                source_ip LIKE '172.20.%%'   OR source_ip LIKE '172.21.%%' OR
                source_ip LIKE '172.22.%%'   OR source_ip LIKE '172.23.%%' OR
                source_ip LIKE '172.24.%%'   OR source_ip LIKE '172.25.%%' OR
                source_ip LIKE '172.26.%%'   OR source_ip LIKE '172.27.%%' OR
                source_ip LIKE '172.28.%%'   OR source_ip LIKE '172.29.%%' OR
                source_ip LIKE '172.30.%%'   OR source_ip LIKE '172.31.%%'
              )
            GROUP BY source_ip
            ORDER BY cnt DESC, est_bytes DESC
            LIMIT 8
            """,
            current_user["org"],
        )

        # Top external destinations: non-RFC-1918 destination IPs by incident count.
        external_rows = await conn.fetch(
            """
            SELECT destination_ip,
                   count(*)::int                           AS cnt,
                   (sum(anomaly_score) * 300000000)::bigint AS est_bytes
            FROM incidents
            WHERE organization_id = $1::uuid
              AND destination_ip NOT LIKE '10.%%'
              AND destination_ip NOT LIKE '192.168.%%'
              AND destination_ip NOT LIKE '172.16.%%'
              AND destination_ip NOT LIKE '172.17.%%'
              AND destination_ip NOT LIKE '172.18.%%'
              AND destination_ip NOT LIKE '172.19.%%'
              AND destination_ip NOT LIKE '172.20.%%'
              AND destination_ip NOT LIKE '172.21.%%'
              AND destination_ip NOT LIKE '172.22.%%'
              AND destination_ip NOT LIKE '172.23.%%'
              AND destination_ip NOT LIKE '172.24.%%'
              AND destination_ip NOT LIKE '172.25.%%'
              AND destination_ip NOT LIKE '172.26.%%'
              AND destination_ip NOT LIKE '172.27.%%'
              AND destination_ip NOT LIKE '172.28.%%'
              AND destination_ip NOT LIKE '172.29.%%'
              AND destination_ip NOT LIKE '172.30.%%'
              AND destination_ip NOT LIKE '172.31.%%'
            GROUP BY destination_ip
            ORDER BY cnt DESC, est_bytes DESC
            LIMIT 9
            """,
            current_user["org"],
        )

    return DashboardKpis(
        events_per_second=0.0,
        open_incidents_by_severity=SeverityCount(**sev_counts),
        top_internal_talkers=[
            IpBytes(ip=r["source_ip"], bytes=r["est_bytes"])
            for r in internal_rows
        ],
        top_external_destinations=[
            IpBytesCountry(
                ip=r["destination_ip"],
                country=_country_for(r["destination_ip"]),
                bytes=r["est_bytes"],
            )
            for r in external_rows
        ],
    )


# ─── /threat-map ──────────────────────────────────────────────────────────────

@router.get("/threat-map", response_model=ThreatMap, response_model_by_alias=True)
async def get_threat_map(
    current_user: _ReadDashboard,
    hours: int = Query(default=24, ge=1, le=168),
) -> ThreatMap:
    async with db.get_connection() as conn:
        await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", current_user["org"])
        rows = await conn.fetch(
            """
            SELECT i.source_ip, i.severity,
                   COALESCE(d.location_lat, -33.8688) AS lat,
                   COALESCE(d.location_lng, 151.2093) AS lng
            FROM incidents i
            JOIN devices d ON d.id = i.device_id
            WHERE i.detected_at > now() - ($1 || ' hours')::interval
              AND i.source_ip NOT LIKE '10.%%'
              AND i.source_ip NOT LIKE '192.168.%%'
              AND i.source_ip NOT LIKE '172.16.%%'
              AND i.source_ip NOT LIKE '172.17.%%'
              AND i.source_ip NOT LIKE '172.18.%%'
              AND i.source_ip NOT LIKE '172.19.%%'
              AND i.source_ip NOT LIKE '172.20.%%'
              AND i.source_ip NOT LIKE '172.21.%%'
              AND i.source_ip NOT LIKE '172.22.%%'
              AND i.source_ip NOT LIKE '172.23.%%'
              AND i.source_ip NOT LIKE '172.24.%%'
              AND i.source_ip NOT LIKE '172.25.%%'
              AND i.source_ip NOT LIKE '172.26.%%'
              AND i.source_ip NOT LIKE '172.27.%%'
              AND i.source_ip NOT LIKE '172.28.%%'
              AND i.source_ip NOT LIKE '172.29.%%'
              AND i.source_ip NOT LIKE '172.30.%%'
              AND i.source_ip NOT LIKE '172.31.%%'
            ORDER BY i.detected_at DESC
            LIMIT 200
            """,
            str(hours),
        )

    arc_map: dict[tuple[str, float, float], dict[str, Any]] = {}
    for row in rows:
        geo = _ip_to_geo(row["source_ip"])
        if not geo:
            continue
        src_lat, src_lng, country = geo
        key = (f"{src_lat},{src_lng}", float(row["lat"]), float(row["lng"]))
        if key not in arc_map:
            arc_map[key] = {
                "from_lat": src_lat, "from_lng": src_lng,
                "to_lat": float(row["lat"]), "to_lng": float(row["lng"]),
                "count": 0, "severity": row["severity"], "country": country,
            }
        arc_map[key]["count"] += 1
        sev_order = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        if sev_order.get(row["severity"], 0) > sev_order.get(arc_map[key]["severity"], 0):
            arc_map[key]["severity"] = row["severity"]

    arcs = [
        ThreatArc(
            from_=GeoPoint(lat=a["from_lat"], lng=a["from_lng"]),
            to=GeoPoint(lat=a["to_lat"], lng=a["to_lng"]),
            count=a["count"],
            severity=a["severity"],
            source_country=a["country"],
        )
        for a in arc_map.values()
    ]

    center = GeoPoint(lat=-33.8688, lng=151.2093)
    if arcs:
        center = arcs[0].to

    return ThreatMap(center=center, arcs=arcs)


# ─── /trend ───────────────────────────────────────────────────────────────────

@router.get("/trend", response_model=TrendData, response_model_by_alias=True)
async def get_trend(current_user: _ReadDashboard) -> TrendData:
    async with db.get_connection() as conn:
        await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", current_user["org"])
        rows = await conn.fetch(
            """
            SELECT
                (detected_at AT TIME ZONE 'Australia/Sydney')::date AS day,
                severity,
                count(*)::int AS cnt
            FROM incidents
            WHERE organization_id = $1::uuid
              AND detected_at > now() - interval '7 days'
            GROUP BY 1, 2
            ORDER BY 1
            """,
            current_user["org"],
        )

    pivot: dict[str, dict[str, int]] = {}
    for row in rows:
        day_str = row["day"].isoformat()
        pivot.setdefault(day_str, {})
        pivot[day_str][row["severity"]] = row["cnt"]

    today = datetime.date.today()
    days: list[TrendDay] = []
    for offset in range(6, -1, -1):
        d = (today - datetime.timedelta(days=offset)).isoformat()
        counts = pivot.get(d, {})
        days.append(TrendDay(
            date=d,
            critical=counts.get("critical", 0),
            high=counts.get("high", 0),
            medium=counts.get("medium", 0),
            low=counts.get("low", 0),
            info=counts.get("info", 0),
        ))

    return TrendData(days=days)


# ─── /attack-types ────────────────────────────────────────────────────────────

_ATTACK_LABEL_MAP: list[tuple[str, str]] = [
    ("beacon",       "c2_beaconing"),
    ("c&c",          "c2_beaconing"),
    ("botnet",       "c2_beaconing"),
    ("command",      "c2_beaconing"),
    ("brute",        "brute_force"),
    ("credential",   "brute_force"),
    ("password",     "brute_force"),
    ("dos",          "ddos"),
    ("ddos",         "ddos"),
    ("flood",        "ddos"),
    ("scan",         "port_scan"),
    ("probe",        "port_scan"),
    ("exfil",        "data_exfil"),
    ("infiltration", "data_exfil"),
    ("lateral",      "lateral_movement"),
    ("pivot",        "lateral_movement"),
    ("web_attack",   "port_scan"),    # SQL/XSS: closest bucket
]


def _classify_attack(label: str) -> str:
    lower = label.lower()
    for keyword, category in _ATTACK_LABEL_MAP:
        if keyword in lower:
            return category
    return "unknown_anomaly"


@router.get("/attack-types", response_model=AttackTypes, response_model_by_alias=True)
async def get_attack_types(current_user: _ReadDashboard) -> AttackTypes:
    async with db.get_connection() as conn:
        await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", current_user["org"])
        rows = await conn.fetch(
            """
            SELECT attack_label, count(*)::int AS cnt
            FROM incidents
            WHERE organization_id = $1::uuid
            GROUP BY attack_label
            """,
            current_user["org"],
        )

    counts: dict[str, int] = {
        "c2_beaconing": 0, "brute_force": 0, "ddos": 0,
        "port_scan": 0, "data_exfil": 0, "lateral_movement": 0, "unknown_anomaly": 0,
    }
    for row in rows:
        key = _classify_attack(row["attack_label"])
        counts[key] += row["cnt"]

    return AttackTypes(
        c2_beaconing=counts["c2_beaconing"],
        brute_force=counts["brute_force"],
        ddos=counts["ddos"],
        port_scan=counts["port_scan"],
        data_exfil=counts["data_exfil"],
        lateral_movement=counts["lateral_movement"],
        unknown_anomaly=counts["unknown_anomaly"],
    )
