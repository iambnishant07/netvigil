"""Audit logging helper — writes to the audit_logs table."""
from __future__ import annotations

import json
from typing import Any

import asyncpg

from netvigil_api.security import uuid7


async def log_action(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    actor_id: str,
    org_id: str,
    action: str,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    await conn.execute(
        """INSERT INTO audit_logs(id, organization_id, actor_id, action, target_id, metadata)
           VALUES($1, $2::uuid, $3::uuid, $4, $5, $6::jsonb)""",
        str(uuid7()), org_id, actor_id, action, target_id,
        json.dumps(metadata or {}),
    )
