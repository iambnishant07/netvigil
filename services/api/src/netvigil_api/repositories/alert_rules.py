from __future__ import annotations

import asyncpg

from netvigil_api.security import uuid7


def _row_to_dict(row: asyncpg.Record) -> dict:  # type: ignore[type-arg]
    d = dict(row)
    for k in ("id", "organization_id"):
        d[k] = str(d[k])
    if d.get("target_user_id"):
        d["target_user_id"] = str(d["target_user_id"])
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    d["mitre_filter"] = list(d.get("mitre_filter") or [])
    return d


async def list_alert_rules(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
) -> list[dict]:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    rows = await conn.fetch(
        "SELECT * FROM alert_rules ORDER BY created_at",
    )
    return [_row_to_dict(r) for r in rows]


async def create_alert_rule(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    name: str,
    min_severity: str,
    channel: str,
    mitre_filter: list[str],
    target_user_id: str | None,
    enabled: bool,
) -> dict:  # type: ignore[type-arg]
    rid = str(uuid7())
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    row = await conn.fetchrow(
        """INSERT INTO alert_rules
             (id, organization_id, name, min_severity, channel,
              mitre_filter, target_user_id, enabled)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *""",
        rid, org_id, name, min_severity, channel,
        mitre_filter, target_user_id, enabled,
    )
    return _row_to_dict(row)  # type: ignore[arg-type]


async def patch_alert_rule(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    rule_id: str,
    **kwargs: object,
) -> dict | None:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    sets = []
    params: list[object] = []
    idx = 1
    mapping = {
        "name": "name", "min_severity": "min_severity",
        "channel": "channel", "mitre_filter": "mitre_filter",
        "target_user_id": "target_user_id", "enabled": "enabled",
    }
    for field, col in mapping.items():
        if kwargs.get(field) is not None:
            sets.append(f"{col} = ${idx}")
            params.append(kwargs[field])
            idx += 1
    if not sets:
        row = await conn.fetchrow("SELECT * FROM alert_rules WHERE id = $1", rule_id)
        return _row_to_dict(row) if row else None  # type: ignore[arg-type]
    params.append(rule_id)
    row = await conn.fetchrow(
        f"UPDATE alert_rules SET {', '.join(sets)} WHERE id = ${idx} RETURNING *",
        *params,
    )
    return _row_to_dict(row) if row else None  # type: ignore[arg-type]


async def delete_alert_rule(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    rule_id: str,
) -> bool:
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    result = await conn.execute("DELETE FROM alert_rules WHERE id = $1", rule_id)
    return result == "DELETE 1"
