from __future__ import annotations

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
    # Store DSN — pool opens lazily on first DB request so uvicorn binds immediately.
    _log.info("startup: configuring database DSN")
    db.configure(settings.asyncpg_dsn)
    _log.info("startup: ready to serve")
    yield
    await db.close_pool()
    _log.info("shutdown: complete")


app = FastAPI(
    title="NetVigil API",
    version="0.1.0",
    lifespan=lifespan,
)

_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
# allow_credentials=True is incompatible with allow_origins=["*"] per the CORS spec.
# When origins is "*" (dev), disable credentials so the wildcard is valid.
_wildcard = _origins == ["*"] or not _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if not _wildcard else ["*"],
    allow_credentials=not _wildcard,
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
