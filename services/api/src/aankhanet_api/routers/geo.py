from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from aankhanet_api.deps import require_permission
from aankhanet_api.geo import batch_lookup, is_private

router = APIRouter(prefix="/geo", tags=["geo"])

_ReadDashboard = Annotated[dict[str, Any], require_permission("dashboard:read")]
_IP_RE = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


class GeoResponse(BaseModel):
    ip: str
    lat: float
    lng: float
    country: str
    found: bool


@router.get("/{ip}", response_model=GeoResponse)
async def get_ip_geo(ip: str, current_user: _ReadDashboard) -> GeoResponse:
    if not _IP_RE.match(ip):
        raise HTTPException(status_code=422, detail="Invalid IP address")
    if is_private(ip):
        return GeoResponse(ip=ip, lat=0.0, lng=0.0, country="", found=False)
    results = await batch_lookup([ip])
    geo = results.get(ip)
    if not geo:
        return GeoResponse(ip=ip, lat=0.0, lng=0.0, country="??", found=False)
    return GeoResponse(ip=ip, lat=geo.lat, lng=geo.lng, country=geo.country, found=True)
