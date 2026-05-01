from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.routers import alert_rules, auth, dashboard, devices, health, incidents


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await db.create_pool(settings.asyncpg_dsn)
    yield
    await db.close_pool()


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
