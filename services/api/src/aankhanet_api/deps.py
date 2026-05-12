from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from aankhanet_api import database as db
from aankhanet_api.permissions import ROLE_PERMISSIONS
from aankhanet_api.security import decode_access_token

_bearer = HTTPBearer()


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict[str, Any]:
    try:
        payload = decode_access_token(creds.credentials)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Invalid or expired token"},
        )
    return payload


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def require_permission(permission: str) -> Any:
    """Return a FastAPI Depends that checks the caller has `permission`.

    Fetches role + status from DB on every request so role changes take effect
    within one access-token TTL (15 min).  Inactive / pending accounts blocked.
    """
    async def _dep(current_user: CurrentUser) -> dict[str, Any]:
        async with db.get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT role, is_active, status FROM users WHERE id = $1::uuid",
                current_user["sub"],
            )
        if not row or not row["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "account_disabled", "message": "Account is disabled"},
            )
        user_status: str = row["status"]
        if user_status == "pending":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "pending_approval", "message": "Your account is awaiting admin approval"},
            )
        if user_status == "rejected":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "account_rejected", "message": "Your account request was rejected"},
            )
        role: str = row["role"]
        if permission not in ROLE_PERMISSIONS.get(role, frozenset()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": f"Requires permission: {permission}"},
            )
        return {**current_user, "role": role}

    return Depends(_dep)


def require_super_admin() -> Any:
    """Dependency that requires system:admin permission (super_admin only)."""
    return require_permission("system:admin")


SuperAdmin = Annotated[dict[str, Any], require_permission("system:admin")]
