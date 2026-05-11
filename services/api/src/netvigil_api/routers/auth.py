from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from urllib.parse import urlencode

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.deps import CurrentUser
from netvigil_api.repositories import auth as auth_repo
from netvigil_api.schemas.auth import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    MfaChallengeRequest,
    MfaDisableRequest,
    MfaSetupResponse,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    UserOut,
)
from netvigil_api.security import (
    create_access_token,
    create_mfa_token,
    decode_mfa_token,
    generate_refresh_token,
    generate_totp_secret,
    get_totp_provisioning_uri,
    hash_password,
    hash_refresh_token,
    verify_password,
    verify_totp,
)


class PushTokenRequest(BaseModel):
    pushToken: str


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
        status=u.get("status", "active"),
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


async def _issue_tokens(user: dict) -> AuthResponse:  # type: ignore[type-arg]
    raw_refresh, refresh_hash = generate_refresh_token()
    async with db.get_connection() as conn:
        await auth_repo.store_refresh_token(
            conn, str(user["id"]), refresh_hash, settings.jwt_refresh_token_ttl
        )
    access = create_access_token(str(user["id"]), str(user["organization_id"]), user["role"])
    return _build_auth_response(user, access, raw_refresh)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthResponse, response_model_by_alias=True)
async def register(body: RegisterRequest) -> AuthResponse:
    async with db.get_connection() as conn:
        existing = await auth_repo.get_user_by_email(conn, body.email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "email_taken", "message": "Email already registered"},
            )

        if body.organization_name:
            # Create new organisation — user becomes admin, immediately active
            org = await auth_repo.create_org(conn, body.organization_name.strip(), body.timezone)
            user = await auth_repo.create_user(
                conn, str(org["id"]), body.email,
                hash_password(body.password),
                role="admin", status="active",
            )
        else:
            # Join existing organisation — pending admin approval
            org = await auth_repo.get_org_by_id(conn, body.organization_id)  # type: ignore[arg-type]
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "org_not_found", "message": "Organisation not found"},
                )
            user = await auth_repo.create_user(
                conn, str(org["id"]), body.email,
                hash_password(body.password),
                role=body.role, status="pending",
            )

    return await _issue_tokens(user)


@router.post("/login", response_model=AuthResponse, response_model_by_alias=True)
async def login(body: LoginRequest) -> AuthResponse:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_email(conn, body.email)
    if not user or not verify_password(user["password_hash"], body.password):
        raise _INVALID
    if user["mfa_enrolled"]:
        return AuthResponse(mfa_required=True, mfa_token=create_mfa_token(str(user["id"])))
    return await _issue_tokens(user)


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
    return await _issue_tokens(user)


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
async def me(current_user: CurrentUser) -> UserOut:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, current_user["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _user_out(user)


@router.get("/organizations")
async def list_organizations() -> list[dict]:  # type: ignore[type-arg]
    """Public endpoint — returns all organisation IDs and names for the register dropdown."""
    async with db.get_connection() as conn:
        return await auth_repo.list_orgs(conn)


@router.put("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(body: PushTokenRequest, current_user: CurrentUser) -> None:
    async with db.get_connection() as conn:
        await conn.execute(
            "UPDATE users SET expo_push_token = $1 WHERE id = $2::uuid",
            body.pushToken,
            current_user["sub"],
        )


# ── MFA ───────────────────────────────────────────────────────────────────────

@router.post("/mfa/setup", response_model=MfaSetupResponse, response_model_by_alias=True)
async def mfa_setup(current_user: CurrentUser) -> MfaSetupResponse:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, current_user["sub"])
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    secret = generate_totp_secret()
    async with db.get_connection() as conn:
        await auth_repo.set_mfa_secret(conn, current_user["sub"], secret)
    uri = get_totp_provisioning_uri(secret, user["email"])
    return MfaSetupResponse(provisioning_uri=uri)


@router.post("/mfa/verify", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_verify(body: MfaVerifyRequest, current_user: CurrentUser) -> None:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, current_user["sub"])
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not set up")
    if not verify_totp(user["mfa_secret"], body.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    async with db.get_connection() as conn:
        await auth_repo.enroll_mfa(conn, current_user["sub"])


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(body: MfaDisableRequest, current_user: CurrentUser) -> None:
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, current_user["sub"])
    if not user or not user.get("mfa_secret"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MFA not enrolled")
    if not verify_totp(user["mfa_secret"], body.code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")
    async with db.get_connection() as conn:
        await auth_repo.disable_mfa(conn, current_user["sub"])


@router.post("/mfa/challenge", response_model=AuthResponse, response_model_by_alias=True)
async def mfa_challenge(body: MfaChallengeRequest) -> AuthResponse:
    try:
        user_id = decode_mfa_token(body.mfa_token)
    except ValueError:
        raise _INVALID
    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_id(conn, user_id)
    if not user or not user.get("mfa_secret"):
        raise _INVALID
    if not verify_totp(user["mfa_secret"], body.code):
        raise _INVALID
    return await _issue_tokens(user)


# ── Google OAuth ──────────────────────────────────────────────────────────────

@router.post("/google", response_model=AuthResponse, response_model_by_alias=True)
async def google_auth(body: GoogleAuthRequest) -> AuthResponse:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": body.id_token},
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_google_token", "message": "Invalid Google token"},
        )
    info = resp.json()
    google_sub: str = info.get("sub", "")
    email: str = info.get("email", "")
    aud: str = info.get("aud", "")
    if not google_sub or not email:
        raise _INVALID
    if settings.google_client_id and aud != settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_google_token", "message": "Token audience mismatch"},
        )

    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_google_sub(conn, google_sub)
        if not user:
            existing = await auth_repo.get_user_by_email(conn, email)
            if existing:
                await auth_repo.link_google_sub(conn, str(existing["id"]), google_sub)
                user = await auth_repo.get_user_by_id(conn, str(existing["id"]))
            else:
                org = await auth_repo.create_org(conn, body.organization_name, "Australia/Brisbane")
                user = await auth_repo.create_google_user(
                    conn, str(org["id"]), email, google_sub, role="admin", status="active",
                )
    if not user:
        raise _INVALID
    return await _issue_tokens(user)


# ── Google OAuth — mobile browser flow ───────────────────────────────────────

_APP_SCHEME = "netvigil"


@router.get("/google/mobile")
async def google_mobile_start() -> RedirectResponse:
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    callback_url = f"{settings.api_base_url}/api/v1/auth/google/mobile-callback"
    qs = urlencode({
        "client_id":     settings.google_client_id,
        "redirect_uri":  callback_url,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "online",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{qs}")


@router.get("/google/mobile-callback")
async def google_mobile_callback(
    code: str | None = None, error: str | None = None
) -> RedirectResponse:
    def _err(msg: str) -> RedirectResponse:
        return RedirectResponse(f"{_APP_SCHEME}://oauth-callback?error={msg}")

    if error or not code:
        return _err(error or "cancelled")
    if not settings.google_client_secret:
        return _err("server_misconfigured")

    callback_url = f"{settings.api_base_url}/api/v1/auth/google/mobile-callback"

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code":          code,
                "client_id":     settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri":  callback_url,
                "grant_type":    "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        return _err("token_exchange_failed")

    id_token: str = token_resp.json().get("id_token", "")
    if not id_token:
        return _err("no_id_token")

    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
        )
    if info_resp.status_code != 200:
        return _err("invalid_token")

    info = info_resp.json()
    google_sub: str = info.get("sub", "")
    email: str = info.get("email", "")
    if not google_sub or not email:
        return _err("missing_user_info")

    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_google_sub(conn, google_sub)
        if not user:
            existing = await auth_repo.get_user_by_email(conn, email)
            if existing:
                await auth_repo.link_google_sub(conn, str(existing["id"]), google_sub)
                user = await auth_repo.get_user_by_id(conn, str(existing["id"]))
            else:
                org = await auth_repo.create_org(conn, email.split("@")[0], "Australia/Brisbane")
                user = await auth_repo.create_google_user(
                    conn, str(org["id"]), email, google_sub, role="admin", status="active",
                )
    if not user:
        return _err("user_creation_failed")

    auth = await _issue_tokens(user)
    u = auth.user
    qs = urlencode({
        "access_token":  auth.access_token,
        "refresh_token": auth.refresh_token,
        "expires_in":    auth.expires_in,
        "user_id":       u.id,
        "org_id":        u.organization_id,
        "email":         u.email,
        "role":          u.role,
        "status":        u.status,
        "mfa_enrolled":  str(u.mfa_enrolled).lower(),
        "created_at":    u.created_at,
    })
    return RedirectResponse(f"{_APP_SCHEME}://oauth-callback?{qs}")
