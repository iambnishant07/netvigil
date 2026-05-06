from __future__ import annotations

from pydantic import EmailStr, field_validator

from netvigil_api.schemas.base import CamelModel


class RegisterRequest(CamelModel):
    organization_name: str
    email: EmailStr
    password: str
    timezone: str = "Australia/Brisbane"

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 12:
            raise ValueError("Password must be at least 12 characters")
        return v

    @field_validator("organization_name")
    @classmethod
    def org_name_length(cls, v: str) -> str:
        if len(v) < 2:
            raise ValueError("Organisation name must be at least 2 characters")
        return v


class LoginRequest(CamelModel):
    email: EmailStr
    password: str


class RefreshRequest(CamelModel):
    refresh_token: str


class UserOut(CamelModel):
    id: str
    organization_id: str
    email: str
    role: str
    mfa_enrolled: bool
    created_at: str


class AuthResponse(CamelModel):
    access_token: str = ""
    refresh_token: str = ""
    expires_in: int = 0
    user: UserOut | None = None
    mfa_required: bool = False
    mfa_token: str | None = None


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
    organization_name: str = "My Organisation"
