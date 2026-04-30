from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

_pool: asyncpg.Pool | None = None  # type: ignore[type-arg]


async def create_pool(dsn: str) -> None:
    global _pool
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=20)


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
