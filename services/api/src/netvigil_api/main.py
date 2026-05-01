from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.routers import alert_rules, auth, dashboard, devices, health, incidents

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
_log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _log.info("startup: connecting to database …")
    dsn_preview = settings.asyncpg_dsn.split("@")[-1] if "@" in settings.asyncpg_dsn else "(local)"
    _log.info("startup: DSN host = %s", dsn_preview)
    try:
        await asyncio.wait_for(db.create_pool(settings.asyncpg_dsn), timeout=30)
    except asyncio.TimeoutError:
        _log.error("startup: database pool creation timed out after 30s — check DATABASE_URL and network")
        raise
    except Exception as exc:
        _log.error("startup: database pool creation failed: %s", exc, exc_info=True)
        raise
    _log.info("startup: database pool ready")
    yield
    await db.close_pool()
    _log.info("shutdown: database pool closed")


app = FastAPI(
    title="NetVigil API",
    version="0.1.0",
    lifespan=lifespan,
)

_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_PREFIX = "/api/v1"
app.include_router(health.router)
app.include_router(auth.router,         prefix=_PREFIX)
app.include_router(devices.router,      prefix=_PREFIX)
app.include_router(incidents.router,    prefix=_PREFIX)
app.include_router(alert_rules.router,  prefix=_PREFIX)
app.include_router(dashboard.router,    prefix=_PREFIX)
