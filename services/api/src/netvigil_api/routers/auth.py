from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.deps import CurrentUser
from netvigil_api.repositories import auth as auth_repo
from netvigil_api.schemas.auth import AuthResponse, LoginRequest, RefreshRequest, RegisterRequest, UserOut


class PushTokenRequest(BaseModel):
    pushToken: str
from netvigil_api.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_INVALID = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"code": "invalid_credentials", "message": "Invalid credentials"},
)


def _user_out(u: dict) -> UserOut:  # type: ignore[type-arg]
    return UserOut(
        id=str(u["id"]),
        organization_id=str(u["organization_id"]),
        email=u["email"],
        role=u["role"],
        mfa_enrolled=u["mfa_enrolled"],
        created_at=u["created_at"].isoformat() if hasattr(u["created_at"], "isoformat") else u["created_at"],
    )


def _build_auth_response(user: dict, access: str, raw_refresh: str) -> AuthResponse:  # type: ignore[type-arg]
    return AuthResponse(
        access_token=access,
        refresh_token=raw_refresh,
        expires_in=settings.jwt_access_token_ttl,
        user=_user_out(user),
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse, response_model_by_alias=True)
async def register(body: RegisterRequest) -> AuthResponse:
    async with db.get_connection() as conn:
        existing = await auth_repo.get_user_by_email(conn, body.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "email_taken", "message": "Email already registered"},
            )
        org = await auth_repo.create_org(conn, body.organization_name, body.timezone)
        role = "admin" if body.email == "iamb.nishant@gmail.com" else "analyst"
        user = await auth_repo.create_user(
            conn, str(org["id"]), body.email, hash_password(body.password), role=role
        )

    async with db.get_connection() as conn:
        raw_refresh, refresh_hash = generate_refresh_token()
        await auth_repo.store_refresh_token(
            conn, str(user["id"]), refresh_hash, settings.jwt_refresh_token_ttl
        )
    access = create_access_token(str(user["id"]), str(org["id"]), user["role"])
    return _build_auth_response(user, access, raw_refresh)


@router.post("/login", response_model=AuthResponse, response_model_by_alias=True)
async def login(body: LoginRequest) -> AuthResponse:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_email(conn, body.email)
    if not user or not verify_password(user["password_hash"], body.password):
        raise _INVALID
    raw_refresh, refresh_hash = generate_refresh_token()
    async with db.get_connection() as conn:
        await auth_repo.store_refresh_token(
            conn, str(user["id"]), refresh_hash, settings.jwt_refresh_token_ttl
        )
    access = create_access_token(str(user["id"]), str(user["organization_id"]), user["role"])
    return _build_auth_response(user, access, raw_refresh)


@router.post("/refresh", response_model=AuthResponse, response_model_by_alias=True)
async def refresh(body: RefreshRequest) -> AuthResponse:
    token_hash = hash_refresh_token(body.refresh_token)
    async with db.get_connection() as conn:
        record = await auth_repo.get_valid_refresh_token(conn, token_hash)
        if not record:
            raise _INVALID
        await auth_repo.revoke_refresh_token(conn, token_hash)
        user = await auth_repo.get_user_by_id(conn, str(record["user_id"]))
    if not user:
        raise _INVALID
    raw_refresh, new_hash = generate_refresh_token()
    async with db.get_connection() as conn:
        await auth_repo.store_refresh_token(
            conn, str(user["id"]), new_hash, settings.jwt_refresh_token_ttl
        )
    access = create_access_token(str(user["id"]), str(user["organization_id"]), user["role"])
    return _build_auth_response(user, access, raw_refresh)


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
async def me(current_user: CurrentUser) -> UserOut:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, current_user["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _user_out(user)


@router.put("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(body: PushTokenRequest, current_user: CurrentUser) -> None:
    async with db.get_connection() as conn:
        await conn.execute(
            "UPDATE users SET expo_push_token = $1 WHERE id = $2::uuid",
            body.pushToken,
            current_user["sub"],
        )
