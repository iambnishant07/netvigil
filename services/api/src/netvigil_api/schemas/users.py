from __future__ import annotations

from pydantic import field_validator

from netvigil_api.schemas.base import CamelModel

ALLOWED_ROLES = frozenset({
    "super_admin", "admin", "senior_analyst", "analyst",
    "threat_hunter", "forensic_investigator", "auditor", "developer",
})


class OrgUserOut(CamelModel):
    id: str
    email: str
    role: str
    is_active: bool
    mfa_enrolled: bool
    created_at: str


class UserPatch(CamelModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v


class AuditLogOut(CamelModel):
    id: str
    actor_id: str
    actor_email: str
    action: str
    target_id: str | None
    metadata: dict  # type: ignore[type-arg]
    created_at: str
