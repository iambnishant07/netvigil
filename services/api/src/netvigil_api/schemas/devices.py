from __future__ import annotations

from netvigil_api.schemas.base import CamelModel


class GeoPoint(CamelModel):
    lat: float
    lng: float


class DeviceCreate(CamelModel):
    name: str
    vendor: str
    protocol: str
    public_ip: str
    location: GeoPoint | None = None


class DeviceUpdate(CamelModel):
    name: str | None = None
    location: GeoPoint | None = None


class DeviceOut(CamelModel):
    id: str
    organization_id: str
    name: str
    vendor: str
    protocol: str
    public_ip: str
    location: GeoPoint | None
    last_seen_at: str | None
    created_at: str


class DeviceCreatedOut(DeviceOut):
    shared_secret: str


class DeviceList(CamelModel):
    items: list[DeviceOut]
    page: int
    page_size: int
    total: int
