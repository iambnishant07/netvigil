from __future__ import annotations

import asyncpg

from aankhanet_api.security import uuid7


def _row_to_dict(row: asyncpg.Record) -> dict:  # type: ignore[type-arg]
    d = dict(row)
    lat = d.pop("location_lat", None)
    lng = d.pop("location_lng", None)
    d["location"] = {"lat": lat, "lng": lng} if lat is not None else None
    d.pop("shared_secret_hash", None)
    for k in ("id", "organization_id", "public_ip"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    if d.get("last_seen_at"):
        d["last_seen_at"] = d["last_seen_at"].isoformat()
    if d.get("created_at"):
        d["created_at"] = d["created_at"].isoformat()
    return d


async def list_devices(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    total = await conn.fetchval("SELECT count(*) FROM devices")
    rows = await conn.fetch(
        "SELECT * FROM devices ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        page_size, (page - 1) * page_size,
    )
    return [_row_to_dict(r) for r in rows], int(total or 0)


async def get_device(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    device_id: str,
) -> dict | None:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    row = await conn.fetchrow("SELECT * FROM devices WHERE id = $1", device_id)
    return _row_to_dict(row) if row else None  # type: ignore[arg-type]


async def create_device(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    name: str,
    vendor: str,
    protocol: str,
    public_ip: str,
    secret_hash: str,
    lat: float | None = None,
    lng: float | None = None,
) -> dict:  # type: ignore[type-arg]
    did = str(uuid7())
    row = await conn.fetchrow(
        """INSERT INTO devices
             (id, organization_id, name, vendor, protocol, public_ip,
              shared_secret_hash, location_lat, location_lng)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING *""",
        did, org_id, name, vendor, protocol, public_ip, secret_hash, lat, lng,
    )
    return _row_to_dict(row)  # type: ignore[arg-type]


async def update_device(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    device_id: str,
    name: str | None,
    lat: float | None,
    lng: float | None,
) -> dict | None:  # type: ignore[type-arg]
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    row = await conn.fetchrow(
        """UPDATE devices
           SET name         = COALESCE($2, name),
               location_lat = CASE WHEN $3::double precision IS NOT NULL THEN $3 ELSE location_lat END,
               location_lng = CASE WHEN $4::double precision IS NOT NULL THEN $4 ELSE location_lng END
           WHERE id = $1 RETURNING *""",
        device_id, name, lat, lng,
    )
    return _row_to_dict(row) if row else None  # type: ignore[arg-type]


async def delete_device(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    device_id: str,
) -> bool:
    await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
    result = await conn.execute("DELETE FROM devices WHERE id = $1", device_id)
    return result == "DELETE 1"
