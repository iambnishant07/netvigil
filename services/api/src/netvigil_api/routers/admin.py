from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status

from netvigil_api import database as db
from netvigil_api.audit import log_action
from netvigil_api.deps import SuperAdmin
from netvigil_api.schemas.users import AdminOrgOut, AdminOrgPatch, AdminUserOut, AdminUserPatch

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
