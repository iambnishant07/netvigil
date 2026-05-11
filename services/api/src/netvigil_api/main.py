from __future__ import annotations

import logging
import re
import sys
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.routers import admin, alert_rules, audit_logs, auth, dashboard, devices, health, incidents, seed, users

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
_log = logging.getLogger(__name__)

_ORIGINS = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
_WILDCARD = _ORIGINS == ["*"] or not _ORIGINS
_RAILWAY_RE = re.compile(r"https://[a-zA-Z0-9-]+\.up\.railway\.app$")


class _CORSMiddleware:
    """Pure-ASGI CORS middleware.

    Replaces Starlette's CORSMiddleware to avoid a Railway-specific 502 on
    OPTIONS preflights.  Handles OPTIONS itself and injects CORS headers on
    every other response without touching the inner app for preflights.
    """

    def __init__(self, app: Any, origins: list[str], wildcard: bool) -> None:
        self._app = app
        self._origins = set(origins)
        self._wildcard = wildcard

    def _allowed(self, origin: str) -> bool:
        if not origin:
            return False
        if self._wildcard:
            return True
        return origin in self._origins or bool(_RAILWAY_RE.match(origin))

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        origin = ""
        for k, v in scope.get("headers", []):
            if k == b"origin":
                origin = v.decode("latin-1")
                break

        ok = self._allowed(origin)

        if scope["method"] == "OPTIONS":
            resp_headers: list[tuple[bytes, bytes]] = [
                (b"content-length", b"0"),
                (b"content-type", b"text/plain"),
            ]
            if ok:
                ao = ("*" if self._wildcard else origin).encode()
                resp_headers += [
                    (b"access-control-allow-origin", ao),
                    (b"access-control-allow-credentials", b"false" if self._wildcard else b"true"),
                    (b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
                    (b"access-control-allow-headers", b"Authorization, Content-Type, Accept, Origin"),
                    (b"access-control-max-age", b"3600"),
                ]
            await send({"type": "http.response.start", "status": 200, "headers": resp_headers})
            await send({"type": "http.response.body", "body": b""})
            return

        async def _send(message: Any) -> None:
            if message["type"] == "http.response.start" and ok and origin:
                ao = ("*" if self._wildcard else origin).encode()
                extra: list[tuple[bytes, bytes]] = [
                    (b"access-control-allow-origin", ao),
                    (b"access-control-allow-credentials", b"false" if self._wildcard else b"true"),
                    (b"vary", b"Origin"),
                ]
                message = {**message, "headers": list(message.get("headers", [])) + extra}
            await send(message)

        await self._app(scope, receive, _send)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
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

app.add_middleware(_CORSMiddleware, origins=_ORIGINS, wildcard=_WILDCARD)

_PREFIX = "/api/v1"
app.include_router(health.router)
app.include_router(auth.router,         prefix=_PREFIX)
app.include_router(devices.router,      prefix=_PREFIX)
app.include_router(incidents.router,    prefix=_PREFIX)
app.include_router(alert_rules.router,  prefix=_PREFIX)
app.include_router(dashboard.router,    prefix=_PREFIX)
app.include_router(seed.router,         prefix=_PREFIX)
app.include_router(users.router,        prefix=_PREFIX)
app.include_router(audit_logs.router,   prefix=_PREFIX)
app.include_router(admin.router,        prefix=_PREFIX)
