from __future__ import annotations

from pydantic import field_validator

from aankhanet_api.schemas.base import CamelModel

ALLOWED_ROLES = frozenset({
    "super_admin", "admin", "senior_analyst", "analyst",
    "threat_hunter", "forensic_investigator", "auditor", "developer",
})

# Org-level admins cannot assign super_admin; only super_admin can via /admin endpoints
ORG_ALLOWED_ROLES = ALLOWED_ROLES - {"super_admin"}

ALLOWED_STATUSES = frozenset({"pending", "active", "rejected"})


class OrgOut(CamelModel):
    id: str
    name: str


class OrgUserOut(CamelModel):
    id: str
    email: str
    role: str
    is_active: bool
    status: str
    mfa_enrolled: bool
    created_at: str


class UserPatch(CamelModel):
    role: str | None = None
    is_active: bool | None = None
    status: str | None = None

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ORG_ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_STATUSES:
            raise ValueError(f"Invalid status: {v}")
        return v


class AuditLogOut(CamelModel):
    id: str
    actor_id: str
    actor_email: str
    action: str
    target_id: str | None
    metadata: dict  # type: ignore[type-arg]
    created_at: str


# ── Admin schemas ─────────────────────────────────────────────────────────────

class AdminOrgOut(CamelModel):
    id: str
    name: str
    timezone: str
    user_count: int
    created_at: str


class AdminOrgPatch(CamelModel):
    name: str | None = None
    timezone: str | None = None


class AdminUserOut(CamelModel):
    id: str
    organization_id: str
    organization_name: str
    email: str
    role: str
    is_active: bool
    status: str
    mfa_enrolled: bool
    created_at: str


class AdminUserPatch(CamelModel):
    role: str | None = None
    is_active: bool | None = None
    status: str | None = None

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_STATUSES:
            raise ValueError(f"Invalid status: {v}")
        return v
