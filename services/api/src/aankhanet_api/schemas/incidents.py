from __future__ import annotations

from aankhanet_api.schemas.base import CamelModel


class TopFeature(CamelModel):
    name: str
    value: float


class IncidentOut(CamelModel):
    id: str
    organization_id: str
    device_id: str
    detected_at: str
    severity: str
    status: str
    attack_label: str
    mitre_technique: str
    source_ip: str
    destination_ip: str
    anomaly_score: float
    narrative: str | None
    top_features: list[TopFeature]


class IncidentList(CamelModel):
    items: list[IncidentOut]
    page: int
    page_size: int
    total: int


class IncidentCreate(CamelModel):
    device_id: str
    severity: str
    attack_label: str
    mitre_technique: str
    source_ip: str
    destination_ip: str
    anomaly_score: float
    narrative: str | None = None
    detected_at: str | None = None


class IncidentPatch(CamelModel):
    status: str | None = None
    severity: str | None = None
    narrative: str | None = None
    note: str | None = None  # accepted for compat, not persisted
