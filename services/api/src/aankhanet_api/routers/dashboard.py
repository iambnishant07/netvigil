from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from aankhanet_api import database as db
from aankhanet_api.deps import require_permission
from aankhanet_api.repositories import incidents as inc_repo
from aankhanet_api.schemas.dashboard import (
    AttackTypes,
    DashboardKpis,
    GeoPoint,
    SeverityCount,
    ThreatArc,
    ThreatMap,
    TrendData,
    TrendDay,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_ReadDashboard = Annotated[dict[str, Any], require_permission("dashboard:read")]

# Rough first-two-octet → (lat, lng, country) for common attacker IP ranges.
_IP_GEO: dict[str, tuple[float, float, str]] = {
    "185.220": (-4.3,   16.5,  "CD"),
    "103.74":  (22.3,  114.2,  "HK"),
    "222.186": (30.6,  114.3,  "CN"),
    "194.165": (50.1,   14.4,  "CZ"),
    "45.33":   (37.8, -122.4,  "US"),
    "2.56":    (52.3,    4.9,  "NL"),
    "92.242":  (55.7,   37.6,  "RU"),
    "197.210": ( 9.1,    7.5,  "NG"),
    "45.142":  (48.2,   16.4,  "AT"),
    "104.21":  (37.4, -122.1,  "US"),
    "1.179":   (-33.9,  151.2, "AU"),
    "203.206": (-37.8,  145.0, "AU"),
}


def _ip_to_geo(ip: str) -> tuple[float, float, str] | None:
    prefix = ".".join(ip.split(".")[:2])
    return _IP_GEO.get(prefix)


@router.get("/kpis", response_model=DashboardKpis, response_model_by_alias=True)
async def get_kpis(current_user: _ReadDashboard) -> DashboardKpis:
    async with db.get_connection() as conn:
        counts = await inc_repo.get_kpis(conn, current_user["org"])
    return DashboardKpis(
        events_per_second=0.0,
        open_incidents_by_severity=SeverityCount(**counts),
        top_internal_talkers=[],
        top_external_destinations=[],
    )


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
                   d.location_lat AS lat, d.location_lng AS lng
            FROM incidents i
            JOIN devices d ON d.id = i.device_id
            WHERE i.detected_at > now() - ($1 || ' hours')::interval
              AND d.location_lat IS NOT NULL
              AND d.location_lng IS NOT NULL
            ORDER BY i.detected_at DESC
            LIMIT 200
            """,
            str(hours),
        )

    arc_map: dict[tuple[str, float, float], dict] = {}  # type: ignore[type-arg]
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

    # Pivot: {date_str -> {severity -> count}}
    pivot: dict[str, dict[str, int]] = {}
    for row in rows:
        day_str = row["day"].isoformat()
        pivot.setdefault(day_str, {})
        pivot[day_str][row["severity"]] = row["cnt"]

    # Emit one entry per day for the past 7 days (fill gaps with zeros)
    import datetime
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


# Maps substrings of attack_label (lower-cased) to frontend category keys.
_ATTACK_LABEL_MAP: list[tuple[str, str]] = [
    ("beacon",   "c2_beaconing"),
    ("c&c",      "c2_beaconing"),
    ("command",  "c2_beaconing"),
    ("brute",    "brute_force"),
    ("credential", "brute_force"),
    ("password", "brute_force"),
    ("dos",      "ddos"),
    ("ddos",     "ddos"),
    ("flood",    "ddos"),
    ("scan",     "port_scan"),
    ("probe",    "port_scan"),
    ("exfil",    "data_exfil"),
    ("exfiltration", "data_exfil"),
    ("lateral",  "lateral_movement"),
    ("pivot",    "lateral_movement"),
    ("move",     "lateral_movement"),
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
