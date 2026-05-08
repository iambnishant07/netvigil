from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, status

from netvigil_api import database as db
from netvigil_api.audit import log_action
from netvigil_api.deps import require_permission
from netvigil_api.schemas.users import OrgUserOut, UserPatch

router = APIRouter(prefix="/users", tags=["users"])

_ReadUser  = Annotated[dict[str, Any], require_permission("users:read")]
_WriteUser = Annotated[dict[str, Any], require_permission("users:write")]


@router.get("", response_model=list[OrgUserOut], response_model_by_alias=True)
async def list_users(current_user: _ReadUser) -> list[OrgUserOut]:
    async with db.get_connection() as conn:
        rows = await conn.fetch(
            """SELECT id, email, role, is_active, mfa_enrolled, created_at
               FROM users
               WHERE organization_id = $1::uuid
               ORDER BY created_at""",
            current_user["org"],
        )
    return [
        OrgUserOut(
            id=str(r["id"]),
            email=r["email"],
            role=r["role"],
            is_active=r["is_active"],
            mfa_enrolled=r["mfa_enrolled"],
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]


@router.patch("/{user_id}", response_model=OrgUserOut, response_model_by_alias=True)
async def patch_user(
    user_id: str,
    body: UserPatch,
    current_user: _WriteUser,
) -> OrgUserOut:
    if body.role is None and body.is_active is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    async with db.get_connection() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM users WHERE id = $1::uuid AND organization_id = $2::uuid",
            user_id, current_user["org"],
        )
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        sets: list[str] = []
        vals: list[Any] = []
        if body.role is not None:
            vals.append(body.role)
            sets.append(f"role = ${len(vals)}")
        if body.is_active is not None:
            vals.append(body.is_active)
            sets.append(f"is_active = ${len(vals)}")

        vals.append(user_id)
        updated = await conn.fetchrow(
            f"""UPDATE users SET {', '.join(sets)}
                WHERE id = ${len(vals)}::uuid
                RETURNING id, email, role, is_active, mfa_enrolled, created_at""",
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

    return OrgUserOut(
        id=str(updated["id"]),
        email=updated["email"],
        role=updated["role"],
        is_active=updated["is_active"],
        mfa_enrolled=updated["mfa_enrolled"],
        created_at=updated["created_at"].isoformat(),
    )
