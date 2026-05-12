from __future__ import annotations

from pydantic import Field

from aankhanet_api.schemas.base import CamelModel


class SeverityCount(CamelModel):
    info: int
    low: int
    medium: int
    high: int
    critical: int


class IpBytes(CamelModel):
    ip: str
    bytes: int


class IpBytesCountry(CamelModel):
    ip: str
    country: str
    bytes: int


class DashboardKpis(CamelModel):
    events_per_second: float
    open_incidents_by_severity: SeverityCount
    top_internal_talkers: list[IpBytes]
    top_external_destinations: list[IpBytesCountry]


class GeoPoint(CamelModel):
    lat: float
    lng: float


class ThreatArc(CamelModel):
    from_: GeoPoint = Field(alias="from")
    to: GeoPoint
    count: int
    severity: str
    source_country: str | None = None


class ThreatMap(CamelModel):
    center: GeoPoint
    arcs: list[ThreatArc]
