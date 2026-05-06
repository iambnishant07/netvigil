from __future__ import annotations

from fastapi import APIRouter, Query

from netvigil_api import database as db
from netvigil_api.deps import CurrentUser
from netvigil_api.repositories import incidents as inc_repo
from netvigil_api.schemas.dashboard import DashboardKpis, GeoPoint, IpBytes, IpBytesCountry, SeverityCount, ThreatArc, ThreatMap

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# Rough first-two-octet → (lat, lng, country) for common attacker IP ranges.
# Only external (non-RFC-1918) addresses are mapped.
_IP_GEO: dict[str, tuple[float, float, str]] = {
    "185.220": (-4.3,   16.5,  "CD"),   # Tor relay
    "103.74":  (22.3,  114.2,  "HK"),   # Hong Kong
    "222.186": (30.6,  114.3,  "CN"),   # Wuhan
    "194.165": (50.1,   14.4,  "CZ"),   # Prague
    "45.33":   (37.8, -122.4,  "US"),   # Linode / San Francisco
    "2.56":    (52.3,    4.9,  "NL"),   # Amsterdam
    "92.242":  (55.7,   37.6,  "RU"),   # Moscow
    "197.210": ( 9.1,    7.5,  "NG"),   # Nigeria
    "45.142":  (48.2,   16.4,  "AT"),   # Vienna
    "104.21":  (37.4, -122.1,  "US"),   # Cloudflare
    "1.179":   (-33.9,  151.2, "AU"),   # Sydney
    "203.206": (-37.8,  145.0, "AU"),   # Melbourne
}


def _ip_to_geo(ip: str) -> tuple[float, float, str] | None:
    prefix = ".".join(ip.split(".")[:2])
    return _IP_GEO.get(prefix)


@router.get("/kpis", response_model=DashboardKpis, response_model_by_alias=True)
async def get_kpis(current_user: CurrentUser) -> DashboardKpis:
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
    current_user: CurrentUser,
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

    # Aggregate: same (source_prefix, device_lat/lng) → one arc, count attacks
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
        # Escalate severity if a worse event shares the same arc
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

    # Center on the org's first device or default to Sydney
    center = GeoPoint(lat=-33.8688, lng=151.2093)
    if arcs:
        center = arcs[0].to

    return ThreatMap(center=center, arcs=arcs)
