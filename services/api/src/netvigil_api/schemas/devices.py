from __future__ import annotations

from pydantic import BaseModel


class GeoPoint(BaseModel):
    lat: float
    lng: float


class DeviceCreate(BaseModel):
    name: str
    vendor: str
    protocol: str
    public_ip: str
    location: GeoPoint | None = None


class DeviceUpdate(BaseModel):
    name: str | None = None
    location: GeoPoint | None = None


class DeviceOut(BaseModel):
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


class DeviceList(BaseModel):
    items: list[DeviceOut]
    page: int
    page_size: int
    total: int
