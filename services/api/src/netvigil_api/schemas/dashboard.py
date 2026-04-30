from __future__ import annotations

from pydantic import BaseModel


class SeverityCount(BaseModel):
    info: int
    low: int
    medium: int
    high: int
    critical: int


class IpBytes(BaseModel):
    ip: str
    bytes: int


class IpBytesCountry(BaseModel):
    ip: str
    country: str
    bytes: int


class DashboardKpis(BaseModel):
    events_per_second: float
    open_incidents_by_severity: SeverityCount
    top_internal_talkers: list[IpBytes]
    top_external_destinations: list[IpBytesCountry]


class GeoPoint(BaseModel):
    lat: float
    lng: float


class ThreatArc(BaseModel):
    from_: GeoPoint
    to: GeoPoint
    count: int
    severity: str
    source_country: str | None = None

    model_config = {"populate_by_name": True}


class ThreatMap(BaseModel):
    center: GeoPoint
    arcs: list[ThreatArc]
