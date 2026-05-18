from __future__ import annotations

import asyncio
import logging
import ssl
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from urllib.parse import urlparse, parse_qs

import asyncpg

_pool: asyncpg.Pool | None = None  # type: ignore[type-arg]
_dsn: str = ""
_lock: asyncio.Lock | None = None
_log = logging.getLogger(__name__)


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


def configure(dsn: str) -> None:
    """Store DSN for lazy pool creation — does not open any connections."""
    global _dsn
    _dsn = dsn


async def _create_pool() -> None:
    global _pool
    dsn = _dsn
    parsed = urlparse(dsn)
    params = parse_qs(parsed.query)
    needs_ssl = "sslmode" in params or "neon.tech" in dsn

    if needs_ssl:
        clean_dsn = dsn.split("?")[0]
        _log.info("db: opening pool with SSL (host=%s)", urlparse(clean_dsn).hostname)
        ssl_ctx = ssl.create_default_context()
        _pool = await asyncpg.create_pool(
            clean_dsn, ssl=ssl_ctx,
            min_size=1, max_size=10,
            statement_cache_size=0,
        )
    else:
        _log.info("db: opening pool without SSL")
        _pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)

    _log.info("db: pool ready")


async def _ensure_pool() -> asyncpg.Pool:  # type: ignore[return]
    global _pool
    if _pool is not None:
        return _pool
    async with _get_lock():
        if _pool is None:
            await _create_pool()
    return _pool  # type: ignore[return-value]


# Keep old name for any callers that passed a DSN at startup
async def create_pool(dsn: str) -> None:
    global _dsn
    _dsn = dsn
    await _create_pool()


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection(
    org_id: str | None = None,
) -> AsyncGenerator[asyncpg.Connection, None]:  # type: ignore[type-arg]
    pool = await _ensure_pool()
    async with pool.acquire() as conn:
        # Wrap in an explicit transaction so set_config(is_local=TRUE) persists
        # for all subsequent statements on this connection.  Without this,
        # asyncpg autocommit mode ends the implicit transaction after the
        # set_config statement and RLS never sees app.current_org.
        async with conn.transaction():
            if org_id:
                await conn.execute("SELECT set_config('app.current_org', $1, TRUE)", org_id)
            yield conn  # type: ignore[misc]
