from __future__ import annotations

from fastapi import APIRouter, Query

from netvigil_api import database as db
from netvigil_api.deps import CurrentUser
from netvigil_api.repositories import incidents as inc_repo
from netvigil_api.schemas.dashboard import DashboardKpis, GeoPoint, IpBytes, IpBytesCountry, SeverityCount, ThreatArc, ThreatMap

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


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
    return ThreatMap(
        center=GeoPoint(lat=-33.8688, lng=151.2093),
        arcs=[],
    )
