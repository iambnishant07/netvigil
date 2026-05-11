from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status

from netvigil_api import database as db
from netvigil_api.audit import log_action
from netvigil_api.deps import CurrentUser, SuperAdmin
from netvigil_api.schemas.users import AdminOrgOut, AdminOrgPatch, AdminUserOut, AdminUserPatch

_EXPO_URL = "https://exp.host/--/api/v2/push/send"

router = APIRouter(prefix="/admin", tags=["admin"])


def _user_row(r: Any) -> AdminUserOut:
    return AdminUserOut(
        id=str(r["id"]),
        organization_id=str(r["organization_id"]),
        organization_name=r["organization_name"],
        email=r["email"],
        role=r["role"],
        is_active=r["is_active"],
        status=r["status"],
        mfa_enrolled=r["mfa_enrolled"],
        created_at=r["created_at"].isoformat(),
    )


@router.get("/organizations", response_model=list[AdminOrgOut], response_model_by_alias=True)
async def list_all_organizations(current_user: SuperAdmin) -> list[AdminOrgOut]:
    async with db.get_connection() as conn:
        rows = await conn.fetch(
            """SELECT o.id, o.name, o.timezone, o.created_at,
                      COUNT(u.id) AS user_count
               FROM organizations o
               LEFT JOIN users u ON u.organization_id = o.id
               GROUP BY o.id
               ORDER BY o.name""",
        )
    return [
        AdminOrgOut(
            id=str(r["id"]),
            name=r["name"],
            timezone=r["timezone"],
            user_count=r["user_count"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.patch(
    "/organizations/{org_id}",
    response_model=AdminOrgOut,
    response_model_by_alias=True,
)
async def patch_organization(
    org_id: str,
    body: AdminOrgPatch,
    current_user: SuperAdmin,
) -> AdminOrgOut:
    if body.name is None and body.timezone is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    async with db.get_connection() as conn:
        sets: list[str] = []
        vals: list[Any] = []
        if body.name is not None:
            vals.append(body.name.strip())
            sets.append(f"name = ${len(vals)}")
        if body.timezone is not None:
            vals.append(body.timezone)
            sets.append(f"timezone = ${len(vals)}")

        vals.append(org_id)
        updated = await conn.fetchrow(
            f"""UPDATE organizations SET {', '.join(sets)}
                WHERE id = ${len(vals)}::uuid
                RETURNING id, name, timezone, created_at""",
            *vals,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found")

        user_count: int = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE organization_id = $1::uuid", org_id
        )
        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="admin.org.update",
            target_id=org_id,
            metadata=body.model_dump(exclude_none=True),
        )

    return AdminOrgOut(
        id=str(updated["id"]),
        name=updated["name"],
        timezone=updated["timezone"],
        user_count=user_count,
        created_at=updated["created_at"].isoformat(),
    )


@router.get(
    "/organizations/{org_id}/users",
    response_model=list[AdminUserOut],
    response_model_by_alias=True,
)
async def list_org_users(org_id: str, current_user: SuperAdmin) -> list[AdminUserOut]:
    async with db.get_connection() as conn:
        rows = await conn.fetch(
            """SELECT u.id, u.organization_id, o.name AS organization_name,
                      u.email, u.role, u.is_active, u.status, u.mfa_enrolled, u.created_at
               FROM users u
               JOIN organizations o ON o.id = u.organization_id
               WHERE u.organization_id = $1::uuid
               ORDER BY u.created_at""",
            org_id,
        )
    return [_user_row(r) for r in rows]


@router.get("/users", response_model=list[AdminUserOut], response_model_by_alias=True)
async def list_all_users(current_user: SuperAdmin) -> list[AdminUserOut]:
    async with db.get_connection() as conn:
        rows = await conn.fetch(
            """SELECT u.id, u.organization_id, o.name AS organization_name,
                      u.email, u.role, u.is_active, u.status, u.mfa_enrolled, u.created_at
               FROM users u
               JOIN organizations o ON o.id = u.organization_id
               ORDER BY o.name, u.created_at""",
        )
    return [_user_row(r) for r in rows]


@router.patch("/users/{user_id}", response_model=AdminUserOut, response_model_by_alias=True)
async def patch_any_user(
    user_id: str,
    body: AdminUserPatch,
    current_user: SuperAdmin,
) -> AdminUserOut:
    if body.role is None and body.is_active is None and body.status is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    async with db.get_connection() as conn:
        sets: list[str] = []
        vals: list[Any] = []
        if body.role is not None:
            vals.append(body.role)
            sets.append(f"role = ${len(vals)}")
        if body.is_active is not None:
            vals.append(body.is_active)
            sets.append(f"is_active = ${len(vals)}")
        if body.status is not None:
            vals.append(body.status)
            sets.append(f"status = ${len(vals)}")

        vals.append(user_id)
        updated = await conn.fetchrow(
            f"""UPDATE users SET {', '.join(sets)}
                WHERE id = ${len(vals)}::uuid
                RETURNING id, organization_id, email, role, is_active, status, mfa_enrolled, created_at""",
            *vals,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        org_name: str = await conn.fetchval(
            "SELECT name FROM organizations WHERE id = $1::uuid",
            str(updated["organization_id"]),
        )
        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="admin.user.update",
            target_id=user_id,
            metadata=body.model_dump(exclude_none=True),
        )

    return AdminUserOut(
        id=str(updated["id"]),
        organization_id=str(updated["organization_id"]),
        organization_name=org_name,
        email=updated["email"],
        role=updated["role"],
        is_active=updated["is_active"],
        status=updated["status"],
        mfa_enrolled=updated["mfa_enrolled"],
        created_at=updated["created_at"].isoformat(),
    )


@router.post("/test-push", status_code=status.HTTP_200_OK)
async def send_test_push(current_user: CurrentUser) -> dict[str, str]:
    async with db.get_connection() as conn:
        token: str | None = await conn.fetchval(
            "SELECT expo_push_token FROM users WHERE id = $1::uuid",
            current_user["sub"],
        )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No push token registered — enable notifications in the mobile app first",
        )
    payload = {
        "to": token,
        "title": "NetVigil Test",
        "body": "Push notifications are working correctly.",
        "data": {"type": "test"},
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(_EXPO_URL, json=payload)
    result: dict[str, object] = resp.json()
    return {"status": "sent", "expo_response": str(result)}


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: str, current_user: SuperAdmin) -> None:
    async with db.get_connection() as conn:
        row = await conn.fetchrow(
            "SELECT id, email FROM users WHERE id = $1::uuid", user_id
        )
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if str(row["id"]) == current_user["sub"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "cannot_delete_self", "message": "Cannot delete your own account"},
            )
        email: str = row["email"]
        async with conn.transaction():
            await conn.execute("DELETE FROM refresh_tokens WHERE user_id = $1::uuid", user_id)
            await conn.execute("DELETE FROM audit_logs WHERE actor_id = $1::uuid", user_id)
            await conn.execute("DELETE FROM users WHERE id = $1::uuid", user_id)
        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="admin.user.delete",
            target_id=user_id,
            metadata={"email": email},
        )
