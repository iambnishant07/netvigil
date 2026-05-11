from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from netvigil_api import database as db
from netvigil_api.audit import log_action
from netvigil_api.deps import require_permission
from netvigil_api.schemas.users import OrgUserOut, UserPatch

router = APIRouter(prefix="/users", tags=["users"])

_ReadUser   = Annotated[dict[str, Any], require_permission("users:read")]
_WriteUser  = Annotated[dict[str, Any], require_permission("users:write")]
_ApproveUser = Annotated[dict[str, Any], require_permission("users:approve")]


def _row_to_out(r: Any) -> OrgUserOut:
    return OrgUserOut(
        id=str(r["id"]),
        email=r["email"],
        role=r["role"],
        is_active=r["is_active"],
        status=r["status"],
        mfa_enrolled=r["mfa_enrolled"],
        created_at=r["created_at"].isoformat(),
    )


@router.get("", response_model=list[OrgUserOut], response_model_by_alias=True)
async def list_users(
    current_user: _ReadUser,
    user_status: str | None = Query(default=None, alias="status"),
) -> list[OrgUserOut]:
    async with db.get_connection() as conn:
        if user_status:
            rows = await conn.fetch(
                """SELECT id, email, role, is_active, status, mfa_enrolled, created_at
                   FROM users
                   WHERE organization_id = $1::uuid AND status = $2
                   ORDER BY created_at""",
                current_user["org"], user_status,
            )
        else:
            rows = await conn.fetch(
                """SELECT id, email, role, is_active, status, mfa_enrolled, created_at
                   FROM users
                   WHERE organization_id = $1::uuid
                   ORDER BY created_at""",
                current_user["org"],
            )
    return [_row_to_out(r) for r in rows]


@router.patch("/{user_id}", response_model=OrgUserOut, response_model_by_alias=True)
async def patch_user(
    user_id: str,
    body: UserPatch,
    current_user: _WriteUser,
) -> OrgUserOut:
    if body.role is None and body.is_active is None and body.status is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    async with db.get_connection() as conn:
        existing = await conn.fetchrow(
            "SELECT id, role FROM users WHERE id = $1::uuid AND organization_id = $2::uuid",
            user_id, current_user["org"],
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if existing["role"] == "super_admin" and current_user["role"] != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": "Cannot modify a super_admin account"},
            )
        if body.role == "super_admin" and current_user["role"] != "super_admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "forbidden", "message": "Cannot assign the super_admin role"},
            )

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
                RETURNING id, email, role, is_active, status, mfa_enrolled, created_at""",
            *vals,
        )

        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="user.update",
            target_id=user_id,
            metadata=body.model_dump(exclude_none=True),
        )

    return _row_to_out(updated)


@router.post("/{user_id}/approve", response_model=OrgUserOut, response_model_by_alias=True)
async def approve_user(user_id: str, current_user: _ApproveUser) -> OrgUserOut:
    async with db.get_connection() as conn:
        updated = await conn.fetchrow(
            """UPDATE users SET status = 'active'
               WHERE id = $1::uuid AND organization_id = $2::uuid
               RETURNING id, email, role, is_active, status, mfa_enrolled, created_at""",
            user_id, current_user["org"],
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="user.approve",
            target_id=user_id,
            metadata={},
        )
    return _row_to_out(updated)


@router.post("/{user_id}/reject", response_model=OrgUserOut, response_model_by_alias=True)
async def reject_user(user_id: str, current_user: _ApproveUser) -> OrgUserOut:
    async with db.get_connection() as conn:
        updated = await conn.fetchrow(
            """UPDATE users SET status = 'rejected'
               WHERE id = $1::uuid AND organization_id = $2::uuid
               RETURNING id, email, role, is_active, status, mfa_enrolled, created_at""",
            user_id, current_user["org"],
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        await log_action(
            conn,
            actor_id=current_user["sub"],
            org_id=current_user["org"],
            action="user.reject",
            target_id=user_id,
            metadata={},
        )
    return _row_to_out(updated)
