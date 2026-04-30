from __future__ import annotations

import json

import asyncpg


def _row_to_dict(row: asyncpg.Record) -> dict:  # type: ignore[type-arg]
    d = dict(row)
    for k in ("id", "organization_id", "device_id"):
        d[k] = str(d[k])
    if d.get("detected_at"):
        d["detected_at"] = d["detected_at"].isoformat()
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    features = d.get("top_features")
    if features is not None and not isinstance(features, list):
        d["top_features"] = json.loads(features)
    return d


async def list_incidents(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    severity: str | None,
    status: str | None,
    device_id: str | None,
    from_dt: str | None,
    to_dt: str | None,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    filters = ["organization_id = $1::uuid"]
    params: list[object] = [org_id]
    idx = 2

    if severity:
        filters.append(f"severity = ${idx}")
        params.append(severity)
        idx += 1
    if status:
        filters.append(f"status = ${idx}")
        params.append(status)
        idx += 1
    if device_id:
        filters.append(f"device_id = ${idx}::uuid")
        params.append(device_id)
        idx += 1
    if from_dt:
        filters.append(f"detected_at >= ${idx}::timestamptz")
        params.append(from_dt)
        idx += 1
    if to_dt:
        filters.append(f"detected_at <= ${idx}::timestamptz")
        params.append(to_dt)
        idx += 1

    where = " AND ".join(filters)
    total = await conn.fetchval(f"SELECT count(*) FROM incidents WHERE {where}", *params)
    rows = await conn.fetch(
        f"""SELECT * FROM incidents WHERE {where}
            ORDER BY detected_at DESC LIMIT ${idx} OFFSET ${idx+1}""",
        *params, page_size, (page - 1) * page_size,
    )
    return [_row_to_dict(r) for r in rows], int(total or 0)


async def get_incident(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    incident_id: str,
) -> dict | None:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    row = await conn.fetchrow(
        "SELECT * FROM incidents WHERE id = $1 AND organization_id = $2::uuid",
        incident_id, org_id,
    )
    return _row_to_dict(row) if row else None  # type: ignore[arg-type]


async def patch_incident(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    incident_id: str,
    status: str,
) -> dict | None:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    row = await conn.fetchrow(
        """UPDATE incidents SET status = $2
           WHERE id = $1 AND organization_id = $3::uuid
           RETURNING *""",
        incident_id, status, org_id,
    )
    return _row_to_dict(row) if row else None  # type: ignore[arg-type]


async def get_kpis(conn: asyncpg.Connection, org_id: str) -> dict:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    rows = await conn.fetch(
        """SELECT severity, count(*)::int AS cnt
           FROM incidents
           WHERE organization_id = $1::uuid AND status NOT IN ('false_positive')
             AND detected_at > now() - interval '24 hours'
           GROUP BY severity""",
        org_id,
    )
    counts = {r["severity"]: r["cnt"] for r in rows}
    return {
        "info": counts.get("info", 0),
        "low":  counts.get("low",  0),
        "medium": counts.get("medium", 0),
        "high": counts.get("high", 0),
        "critical": counts.get("critical", 0),
    }
