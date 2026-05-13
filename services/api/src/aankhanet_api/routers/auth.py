from __future__ import annotations

from datetime import date as _date
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from aankhanet_api import database as db
from aankhanet_api.config import settings
from aankhanet_api.deps import CurrentUser
from aankhanet_api.repositories import auth as auth_repo
from aankhanet_api.schemas.auth import (
    AuthResponse,
    GoogleAuthRequest,
    GoogleCompleteRequest,
    LoginRequest,
    MfaChallengeRequest,
    MfaDisableRequest,
    MfaSetupResponse,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from aankhanet_api.security import (
    create_access_token,
    create_google_session_token,
    create_mfa_token,
    decode_google_session_token,
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
        row = await conn.fetchrow(
            """SELECT u.*, o.name AS organization_name
               FROM users u
               JOIN organizations o ON o.id = u.organization_id
               WHERE u.id = $1::uuid""",
            current_user["sub"],
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    r = dict(row)
    return UserOut(
        id=str(r["id"]),
        organization_id=str(r["organization_id"]),
        organization_name=r.get("organization_name"),
        email=r["email"],
        role=r["role"],
        status=r.get("status", "active"),
        mfa_enrolled=r["mfa_enrolled"],
        created_at=r["created_at"].isoformat(),
        full_name=r.get("full_name"),
        phone=r.get("phone"),
        address=r.get("address"),
        dob=r["dob"].isoformat() if r.get("dob") else None,
        has_google_auth=bool(r.get("google_sub")),
        has_password_auth=r.get("password_hash", "") != "GOOGLE_OAUTH",
    )


@router.patch("/me", response_model=UserOut, response_model_by_alias=True)
async def update_me(body: UpdateProfileRequest, current_user: CurrentUser) -> UserOut:
    if all(v is None for v in [body.full_name, body.phone, body.address, body.dob]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update",
        )
    async with db.get_connection() as conn:
        sets: list[str] = []
        vals: list[object] = []
        if body.full_name is not None:
            vals.append(body.full_name.strip() or None)
            sets.append(f"full_name = ${len(vals)}")
        if body.phone is not None:
            vals.append(body.phone.strip() or None)
            sets.append(f"phone = ${len(vals)}")
        if body.address is not None:
            vals.append(body.address.strip() or None)
            sets.append(f"address = ${len(vals)}")
        if body.dob is not None:
            try:
                dob_val: _date | None = _date.fromisoformat(body.dob) if body.dob else None
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={"code": "invalid_dob", "message": "Date of birth must be in YYYY-MM-DD format"},
                )
            vals.append(dob_val)
            sets.append(f"dob = ${len(vals)}")
        vals.append(current_user["sub"])
        await conn.execute(  # noqa: S608
            f"UPDATE users SET {', '.join(sets)} WHERE id = ${len(vals)}::uuid",
            *vals,
        )
        row = await conn.fetchrow(
            """SELECT u.*, o.name AS organization_name
               FROM users u
               JOIN organizations o ON o.id = u.organization_id
               WHERE u.id = $1::uuid""",
            current_user["sub"],
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    r = dict(row)
    return UserOut(
        id=str(r["id"]),
        organization_id=str(r["organization_id"]),
        organization_name=r.get("organization_name"),
        email=r["email"],
        role=r["role"],
        status=r.get("status", "active"),
        mfa_enrolled=r["mfa_enrolled"],
        created_at=r["created_at"].isoformat(),
        full_name=r.get("full_name"),
        phone=r.get("phone"),
        address=r.get("address"),
        dob=r["dob"].isoformat() if r.get("dob") else None,
        has_google_auth=bool(r.get("google_sub")),
        has_password_auth=r.get("password_hash", "") != "GOOGLE_OAUTH",
    )


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

async def _verify_google_id_token(id_token: str) -> tuple[str, str]:
    """Verify Google id_token and return (google_sub, email). Raises HTTPException on failure."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
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
    return google_sub, email


@router.post("/google", response_model=AuthResponse, response_model_by_alias=True)
async def google_auth(body: GoogleAuthRequest) -> AuthResponse:
    google_sub, email = await _verify_google_id_token(body.id_token)

    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_google_sub(conn, google_sub)
        if not user:
            existing = await auth_repo.get_user_by_email(conn, email)
            if existing:
                await auth_repo.link_google_sub(conn, str(existing["id"]), google_sub)
                user = await auth_repo.get_user_by_id(conn, str(existing["id"]))

    if not user:
        # New Google user — client must supply org/role before we create the account
        return AuthResponse(
            needs_org_selection=True,
            google_session_token=create_google_session_token(google_sub, email),
            google_email=email,
        )

    return await _issue_tokens(user)


@router.post("/google/complete", response_model=AuthResponse, response_model_by_alias=True)
async def google_complete(body: GoogleCompleteRequest) -> AuthResponse:
    try:
        session = decode_google_session_token(body.google_session_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "invalid_google_session",
                "message": "Google session expired or invalid",
            },
        ) from exc

    google_sub = session["google_sub"]
    email = session["email"]

    async with db.get_connection() as conn:
        user = await auth_repo.get_user_by_google_sub(conn, google_sub)
        if not user:
            existing = await auth_repo.get_user_by_email(conn, email)
            if existing:
                await auth_repo.link_google_sub(conn, str(existing["id"]), google_sub)
                user = await auth_repo.get_user_by_id(conn, str(existing["id"]))
            elif body.organization_name:
                org = await auth_repo.create_org(
                    conn, body.organization_name.strip(), body.timezone
                )
                user = await auth_repo.create_google_user(
                    conn, str(org["id"]), email, google_sub, role="admin", status="active",
                )
            else:
                org = await auth_repo.get_org_by_id(conn, body.organization_id)  # type: ignore[arg-type]
                if not org:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail={"code": "org_not_found", "message": "Organisation not found"},
                    )
                user = await auth_repo.create_google_user(
                    conn, str(org["id"]), email, google_sub, role=body.role, status="pending",
                )

    if not user:
        raise _INVALID
    return await _issue_tokens(user)


# ── Google OAuth — mobile browser flow ───────────────────────────────────────

_APP_SCHEME = "aankhanet"


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

    if not user:
        # New user — redirect back with a session token so the app can show org/role picker
        session_token = create_google_session_token(google_sub, email)
        qs = urlencode({"needs_org": "true", "google_session_token": session_token, "email": email})
        return RedirectResponse(f"{_APP_SCHEME}://oauth-callback?{qs}")

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
