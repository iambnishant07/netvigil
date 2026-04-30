from __future__ import annotations

from pydantic import BaseModel


class AlertRuleCreate(BaseModel):
    name: str
    min_severity: str
    channel: str
    mitre_filter: list[str] = []
    target_user_id: str | None = None
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = None
    min_severity: str | None = None
    channel: str | None = None
    mitre_filter: list[str] | None = None
    target_user_id: str | None = None
    enabled: bool | None = None


class AlertRuleOut(BaseModel):
    id: str
    organization_id: str
    name: str
    min_severity: str
    channel: str
    mitre_filter: list[str]
    target_user_id: str | None
    enabled: bool
    created_at: str
