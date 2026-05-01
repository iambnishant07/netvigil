from __future__ import annotations

import logging
import ssl
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import urlparse, parse_qs

import asyncpg

_pool: asyncpg.Pool | None = None  # type: ignore[type-arg]
_log = logging.getLogger(__name__)


async def create_pool(dsn: str) -> None:
    global _pool
    parsed = urlparse(dsn)
    params = parse_qs(parsed.query)
    needs_ssl = "sslmode" in params or "neon.tech" in dsn

    if needs_ssl:
        # Strip all query params — asyncpg takes ssl context directly.
        # statement_cache_size=0 required for Neon/PgBouncer pooler compatibility.
        clean_dsn = dsn.split("?")[0]
        _log.info("db: creating pool with SSL (clean_dsn host=%s)", urlparse(clean_dsn).hostname)
        ssl_ctx = ssl.create_default_context()
        _pool = await asyncpg.create_pool(
            clean_dsn, ssl=ssl_ctx,
            min_size=1, max_size=10,
            statement_cache_size=0,
        )
    else:
        _log.info("db: creating pool without SSL")
        _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection(
    org_id: str | None = None,
) -> AsyncGenerator[asyncpg.Connection, None]:  # type: ignore[type-arg]
    assert _pool is not None, "Pool not initialised"
    async with _pool.acquire() as conn:
        if org_id:
            await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
        yield conn  # type: ignore[misc]
