from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query

from netvigil_api import database as db
from netvigil_api.deps import require_permission
from netvigil_api.schemas.users import AuditLogOut

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

_ReadAudit = Annotated[dict[str, Any], require_permission("audit_logs:read")]


@router.get("", response_model=list[AuditLogOut], response_model_by_alias=True)
async def list_audit_logs(
    current_user: _ReadAudit,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> list[AuditLogOut]:
    offset = (page - 1) * page_size
    async with db.get_connection() as conn:
        rows = await conn.fetch(
            """SELECT al.id, al.actor_id, u.email AS actor_email,
                      al.action, al.target_id, al.metadata, al.created_at
               FROM audit_logs al
               JOIN users u ON u.id = al.actor_id
               WHERE al.organization_id = $1::uuid
               ORDER BY al.created_at DESC
               LIMIT $2 OFFSET $3""",
            current_user["org"], page_size, offset,
        )
    return [
        AuditLogOut(
            id=str(r["id"]),
            actor_id=str(r["actor_id"]),
            actor_email=r["actor_email"],
            action=r["action"],
            target_id=r["target_id"],
            metadata=dict(r["metadata"]) if r["metadata"] else {},
            created_at=r["created_at"].isoformat(),
        )
        for r in rows
    ]
