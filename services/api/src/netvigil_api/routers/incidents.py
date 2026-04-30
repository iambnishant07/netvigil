from __future__ import annotations

import asyncio
import json

import asyncpg
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from netvigil_api import database as db
from netvigil_api.config import settings
from netvigil_api.deps import CurrentUser
from netvigil_api.repositories import incidents as inc_repo
from netvigil_api.schemas.incidents import IncidentList, IncidentOut, IncidentPatch

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=IncidentList, response_model_by_alias=True)
async def list_incidents(
    current_user: CurrentUser,
    severity: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    device_id: str | None = Query(default=None),
    from_dt: str | None = Query(default=None, alias="from"),
    to_dt: str | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> IncidentList:
    async with db.get_connection() as conn:
        items, total = await inc_repo.list_incidents(
            conn, current_user["org"], severity, status_filter,
            device_id, from_dt, to_dt, page, page_size,
        )
    return IncidentList(
        items=[IncidentOut(**i) for i in items],
        page=page, page_size=page_size, total=total,
    )


@router.get("/stream")
async def incident_stream(websocket: WebSocket) -> None:
    await websocket.accept()
    conn: asyncpg.Connection = await asyncpg.connect(settings.asyncpg_dsn)  # type: ignore[type-arg]
    queue: asyncio.Queue[str] = asyncio.Queue()

    def _on_notify(_con: object, _pid: int, _channel: str, payload: str) -> None:
        queue.put_nowait(payload)

    await conn.add_listener("incidents_changed", _on_notify)  # type: ignore[arg-type]
    try:
        while True:
            payload = await asyncio.wait_for(queue.get(), timeout=30.0)
            await websocket.send_text(payload)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        pass
    finally:
        await conn.remove_listener("incidents_changed", _on_notify)  # type: ignore[arg-type]
        await conn.close()


@router.get("/{incident_id}", response_model=IncidentOut, response_model_by_alias=True)
async def get_incident(incident_id: str, current_user: CurrentUser) -> IncidentOut:
    async with db.get_connection() as conn:
        incident = await inc_repo.get_incident(conn, current_user["org"], incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return IncidentOut(**incident)


@router.patch("/{incident_id}", response_model=IncidentOut, response_model_by_alias=True)
async def patch_incident(
    incident_id: str, body: IncidentPatch, current_user: CurrentUser
) -> IncidentOut:
    valid = {"open", "acknowledged", "confirmed", "false_positive"}
    if body.status not in valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    async with db.get_connection() as conn:
        incident = await inc_repo.patch_incident(conn, current_user["org"], incident_id, body.status)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return IncidentOut(**incident)
