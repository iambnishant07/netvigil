from __future__ import annotations

import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query

from aankhanet_api import database as db
from aankhanet_api.deps import EffectiveOrg, require_permission
from aankhanet_api.geo import batch_lookup, country_for_sync, is_private
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


# ─── /kpis ───────────────────────────────────────────────────────────────────

@router.get("/kpis", response_model=DashboardKpis, response_model_by_alias=True)
async def get_kpis(current_user: _ReadDashboard, org: EffectiveOrg) -> DashboardKpis:
    async with db.get_connection(org) as conn:
        sev_counts = await inc_repo.get_kpis(conn, org)

        # Top internal talkers — internal source IPs by incident count.
        # anomaly_score × 500 MB used as a traffic-volume proxy (no netflow table).
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
                source_ip LIKE '172.24.%%'   OR source_ip LIKE '172.24.%%' OR
                source_ip LIKE '172.26.%%'   OR source_ip LIKE '172.27.%%' OR
                source_ip LIKE '172.28.%%'   OR source_ip LIKE '172.29.%%' OR
                source_ip LIKE '172.30.%%'   OR source_ip LIKE '172.31.%%'
              )
            GROUP BY source_ip
            ORDER BY cnt DESC, est_bytes DESC
            LIMIT 8
            """,
            org,
        )

        # Top external destinations — non-RFC-1918 destination IPs.
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
            org,
        )

    # Geolocate all external destination IPs concurrently for country codes
    dest_ips = [r["destination_ip"] for r in external_rows]
    geo_map = await batch_lookup(dest_ips)

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
                country=(geo_map[r["destination_ip"]].country
                         if r["destination_ip"] in geo_map
                         else country_for_sync(r["destination_ip"])),
                bytes=r["est_bytes"],
            )
            for r in external_rows
        ],
    )


# ─── /threat-map ──────────────────────────────────────────────────────────────

@router.get("/threat-map", response_model=ThreatMap, response_model_by_alias=True)
async def get_threat_map(
    current_user: _ReadDashboard,
    org: EffectiveOrg,
    hours: int = Query(default=24, ge=1, le=168),
) -> ThreatMap:
    async with db.get_connection(org) as conn:
        rows = await conn.fetch(
            """
            SELECT i.source_ip, i.severity,
                   COALESCE(d.location_lat, -33.8688) AS lat,
                   COALESCE(d.location_lng, 151.2093) AS lng
            FROM incidents i
            JOIN devices d ON d.id = i.device_id
            WHERE i.detected_at > now() - ($1 || ' hours')::interval
              AND NOT (
                i.source_ip LIKE '10.%%'       OR
                i.source_ip LIKE '192.168.%%'  OR
                i.source_ip LIKE '172.16.%%'   OR i.source_ip LIKE '172.17.%%' OR
                i.source_ip LIKE '172.18.%%'   OR i.source_ip LIKE '172.19.%%' OR
                i.source_ip LIKE '172.20.%%'   OR i.source_ip LIKE '172.21.%%' OR
                i.source_ip LIKE '172.22.%%'   OR i.source_ip LIKE '172.23.%%' OR
                i.source_ip LIKE '172.24.%%'   OR i.source_ip LIKE '172.25.%%' OR
                i.source_ip LIKE '172.26.%%'   OR i.source_ip LIKE '172.27.%%' OR
                i.source_ip LIKE '172.28.%%'   OR i.source_ip LIKE '172.29.%%' OR
                i.source_ip LIKE '172.30.%%'   OR i.source_ip LIKE '172.31.%%'
              )
            ORDER BY i.detected_at DESC
            LIMIT 200
            """,
            str(hours),
        )

    # Geolocate all unique source IPs in one concurrent batch
    # — GeoLite2 DB used first (if present), then ipinfo.io HTTPS API for misses
    source_ips = [row["source_ip"] for row in rows]
    geo_map = await batch_lookup(source_ips)

    # Aggregate into arcs keyed by (source_coords, target_coords)
    arc_map: dict[tuple[str, float, float], dict[str, Any]] = {}
    for row in rows:
        geo = geo_map.get(row["source_ip"])
        if not geo:
            continue
        key = (f"{geo.lat},{geo.lng}", float(row["lat"]), float(row["lng"]))
        if key not in arc_map:
            arc_map[key] = {
                "from_lat": geo.lat,  "from_lng": geo.lng,
                "to_lat":   float(row["lat"]), "to_lng": float(row["lng"]),
                "count":    0,
                "severity": row["severity"],
                "country":  geo.country,
            }
        arc_map[key]["count"] += 1
        sev_order = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        if sev_order.get(row["severity"], 0) > sev_order.get(arc_map[key]["severity"], 0):
            arc_map[key]["severity"] = row["severity"]

    arcs = [
        ThreatArc(
            from_=GeoPoint(lat=a["from_lat"], lng=a["from_lng"]),
            to=GeoPoint(lat=a["to_lat"],   lng=a["to_lng"]),
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
async def get_trend(current_user: _ReadDashboard, org: EffectiveOrg) -> TrendData:
    async with db.get_connection(org) as conn:
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
            org,
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
    ("web_attack",   "port_scan"),
]


def _classify_attack(label: str) -> str:
    lower = label.lower()
    for keyword, category in _ATTACK_LABEL_MAP:
        if keyword in lower:
            return category
    return "unknown_anomaly"


@router.get("/attack-types", response_model=AttackTypes, response_model_by_alias=True)
async def get_attack_types(current_user: _ReadDashboard, org: EffectiveOrg) -> AttackTypes:
    async with db.get_connection(org) as conn:
        rows = await conn.fetch(
            """
            SELECT attack_label, count(*)::int AS cnt
            FROM incidents
            WHERE organization_id = $1::uuid
            GROUP BY attack_label
            """,
            org,
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
