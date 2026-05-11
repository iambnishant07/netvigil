from __future__ import annotations

import asyncpg

from netvigil_api.security import uuid7


async def create_org(conn: asyncpg.Connection, name: str, timezone: str) -> dict:  # type: ignore[type-arg]
    org_id = str(uuid7())
    row = await conn.fetchrow(
        "INSERT INTO organizations(id, name, timezone) VALUES($1,$2,$3) RETURNING *",
        org_id, name, timezone,
    )
    return dict(row)  # type: ignore[arg-type]


async def get_org_by_id(conn: asyncpg.Connection, org_id: str) -> dict | None:  # type: ignore[type-arg]
    row = await conn.fetchrow("SELECT * FROM organizations WHERE id = $1::uuid", org_id)
    return dict(row) if row else None  # type: ignore[arg-type]


async def list_orgs(conn: asyncpg.Connection) -> list[dict]:  # type: ignore[type-arg]
    rows = await conn.fetch("SELECT id, name FROM organizations ORDER BY name")
    return [dict(r) for r in rows]


async def get_user_by_email(conn: asyncpg.Connection, email: str) -> dict | None:  # type: ignore[type-arg]
    row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
    return dict(row) if row else None  # type: ignore[arg-type]


async def get_user_by_id(conn: asyncpg.Connection, user_id: str) -> dict | None:  # type: ignore[type-arg]
    row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    return dict(row) if row else None  # type: ignore[arg-type]


async def get_user_by_google_sub(conn: asyncpg.Connection, google_sub: str) -> dict | None:  # type: ignore[type-arg]
    row = await conn.fetchrow("SELECT * FROM users WHERE google_sub = $1", google_sub)
    return dict(row) if row else None  # type: ignore[arg-type]


async def create_user(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    email: str,
    password_hash: str,
    role: str = "admin",
    status: str = "active",
) -> dict:  # type: ignore[type-arg]
    user_id = str(uuid7())
    row = await conn.fetchrow(
        """INSERT INTO users(id, organization_id, email, password_hash, role, status)
           VALUES($1,$2,$3,$4,$5,$6) RETURNING *""",
        user_id, org_id, email, password_hash, role, status,
    )
    return dict(row)  # type: ignore[arg-type]


async def create_google_user(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    org_id: str,
    email: str,
    google_sub: str,
    role: str = "admin",
    status: str = "active",
) -> dict:  # type: ignore[type-arg]
    user_id = str(uuid7())
    row = await conn.fetchrow(
        """INSERT INTO users(id, organization_id, email, password_hash, role, google_sub, status)
           VALUES($1,$2,$3,'GOOGLE_OAUTH',$4,$5,$6) RETURNING *""",
        user_id, org_id, email, role, google_sub, status,
    )
    return dict(row)  # type: ignore[arg-type]


async def link_google_sub(conn: asyncpg.Connection, user_id: str, google_sub: str) -> None:  # type: ignore[type-arg]
    await conn.execute(
        "UPDATE users SET google_sub = $1 WHERE id = $2::uuid",
        google_sub, user_id,
    )


async def store_refresh_token(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    user_id: str,
    token_hash: str,
    ttl_seconds: int,
) -> None:
    tid = str(uuid7())
    await conn.execute(
        """INSERT INTO refresh_tokens(id, user_id, token_hash, expires_at)
           VALUES($1,$2,$3, now() + ($4 || ' seconds')::interval)""",
        tid, user_id, token_hash, str(ttl_seconds),
    )


async def get_valid_refresh_token(
    conn: asyncpg.Connection,  # type: ignore[type-arg]
    token_hash: str,
) -> dict | None:  # type: ignore[type-arg]
    row = await conn.fetchrow(
        """SELECT rt.*, u.organization_id, u.role
           FROM refresh_tokens rt
           JOIN users u ON u.id = rt.user_id
           WHERE rt.token_hash = $1
             AND rt.revoked = FALSE
             AND rt.expires_at > now()""",
        token_hash,
    )
    return dict(row) if row else None  # type: ignore[arg-type]


async def revoke_refresh_token(conn: asyncpg.Connection, token_hash: str) -> None:  # type: ignore[type-arg]
    await conn.execute(
        "UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1",
        token_hash,
    )


# ── MFA ───────────────────────────────────────────────────────────────────────

async def set_mfa_secret(conn: asyncpg.Connection, user_id: str, secret: str) -> None:  # type: ignore[type-arg]
    await conn.execute(
        "UPDATE users SET mfa_secret = $1 WHERE id = $2::uuid",
        secret, user_id,
    )


async def enroll_mfa(conn: asyncpg.Connection, user_id: str) -> None:  # type: ignore[type-arg]
    await conn.execute(
        "UPDATE users SET mfa_enrolled = TRUE WHERE id = $1::uuid",
        user_id,
    )


async def disable_mfa(conn: asyncpg.Connection, user_id: str) -> None:  # type: ignore[type-arg]
    await conn.execute(
        "UPDATE users SET mfa_enrolled = FALSE, mfa_secret = NULL WHERE id = $1::uuid",
        user_id,
    )
