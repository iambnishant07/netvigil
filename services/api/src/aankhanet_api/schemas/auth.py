from __future__ import annotations

import re
from datetime import date as _date

from pydantic import EmailStr, field_validator, model_validator

from aankhanet_api.schemas.base import CamelModel

REGISTERABLE_ROLES = frozenset({
    "admin", "senior_analyst", "analyst",
    "threat_hunter", "forensic_investigator", "auditor", "developer",
})

_ORG_XOR_MSG = "Provide either organizationName (create) or organizationId (join)"


class RegisterRequest(CamelModel):
    # Exactly one of organization_name (create) or organization_id (join) must be set
    organization_name: str | None = None
    organization_id: str | None = None
    email: EmailStr
    password: str
    role: str = "analyst"
    timezone: str = "Australia/Brisbane"
    full_name: str
    phone: str
    dob: str  # YYYY-MM-DD

    @model_validator(mode="after")
    def org_xor(self) -> RegisterRequest:
        has_name = bool(self.organization_name and self.organization_name.strip())
        has_id = bool(self.organization_id and self.organization_id.strip())
        if not has_name and not has_id:
            raise ValueError("Provide either organizationName (create) or organizationId (join)")
        if has_name and has_id:
            raise ValueError("Provide either organizationName or organizationId, not both")
        if has_name and len(self.organization_name.strip()) < 2:  # type: ignore[union-attr]
            raise ValueError("Organisation name must be at least 2 characters")
        return self

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in REGISTERABLE_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return v

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[\d\s\+\-\(\)\.]{6,20}$", v):
            raise ValueError("Enter a valid phone number (6–20 digits, spaces, +, -, ())")
        return v

    @field_validator("dob")
    @classmethod
    def dob_valid(cls, v: str) -> str:
        try:
            d = _date.fromisoformat(v)
        except ValueError:
            raise ValueError("Enter a valid date of birth (YYYY-MM-DD)")
        today = _date.today()
        age_days = (today - d).days
        if age_days < 16 * 365:
            raise ValueError("You must be at least 16 years old")
        if age_days > 120 * 365:
            raise ValueError("Enter a valid date of birth")
        return v


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class RefreshRequest(CamelModel):
    refresh_token: str


class UserOut(CamelModel):
    id: str
    organization_id: str
    organization_name: str | None = None
    email: str
    role: str
    status: str
    mfa_enrolled: bool
    created_at: str
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    dob: str | None = None
    has_google_auth: bool = False
    has_password_auth: bool = False


class UpdateProfileRequest(CamelModel):
    full_name: str | None = None
    phone: str | None = None
    address: str | None = None
    dob: str | None = None


class AuthResponse(CamelModel):
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 0
    user: UserOut | None = None
    mfa_required: bool = False
    mfa_token: str | None = None
    needs_org_selection: bool = False
    google_session_token: str | None = None
    google_email: str | None = None


# ── MFA ───────────────────────────────────────────────────────────────────────

class MfaSetupResponse(CamelModel):
    provisioning_uri: str


class MfaVerifyRequest(CamelModel):
    code: str


class MfaChallengeRequest(CamelModel):
    mfa_token: str
    code: str


class MfaDisableRequest(CamelModel):
    code: str


# ── Google OAuth ──────────────────────────────────────────────────────────────

class GoogleAuthRequest(CamelModel):
    id_token: str


class GoogleCompleteRequest(CamelModel):
    google_session_token: str
    organization_name: str | None = None
    organization_id: str | None = None
    role: str = "analyst"
    timezone: str = "Australia/Brisbane"

    @model_validator(mode="after")
    def org_xor(self) -> GoogleCompleteRequest:
        has_name = bool(self.organization_name and self.organization_name.strip())
        has_id = bool(self.organization_id and self.organization_id.strip())
        if not has_name and not has_id:
            raise ValueError(_ORG_XOR_MSG)
        if has_name and has_id:
            raise ValueError("Provide either organizationName or organizationId, not both")
        return self

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in REGISTERABLE_ROLES:
            raise ValueError(f"Invalid role: {v}")
        return v
