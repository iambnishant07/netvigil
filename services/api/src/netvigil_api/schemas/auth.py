from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
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


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    organization_id: str
    email: str
    role: str
    mfa_enrolled: bool
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserOut
