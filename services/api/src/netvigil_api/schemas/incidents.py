from __future__ import annotations

from netvigil_api.schemas.base import CamelModel


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


class IncidentPatch(CamelModel):
    status: str
    note: str | None = None
