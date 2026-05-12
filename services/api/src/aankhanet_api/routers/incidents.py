from __future__ import annotations

import asyncio
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from aankhanet_api import database as db
from aankhanet_api.config import settings
from aankhanet_api.deps import require_permission
from aankhanet_api.permissions import ROLE_PERMISSIONS
from aankhanet_api.repositories import incidents as inc_repo
from aankhanet_api.schemas.incidents import IncidentCreate, IncidentList, IncidentOut, IncidentPatch

router = APIRouter(prefix="/incidents", tags=["incidents"])

_ReadIncident  = Annotated[dict[str, Any], require_permission("incidents:read")]
_AckIncident   = Annotated[dict[str, Any], require_permission("incidents:acknowledge")]
_WriteIncident = Annotated[dict[str, Any], require_permission("incidents:write")]


@router.post(
    "",
    response_model=IncidentOut,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_incident(
    body: IncidentCreate, current_user: _WriteIncident,
) -> IncidentOut:
    valid_severities = {"info", "low", "medium", "high", "critical"}
    if body.severity not in valid_severities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity",
        )
    if not 0.0 <= body.anomaly_score <= 1.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="anomaly_score must be between 0 and 1",
        )

    async with db.get_connection() as conn:
        incident = await inc_repo.create_incident(
            conn, current_user["org"],
            device_id=body.device_id,
            severity=body.severity,
            attack_label=body.attack_label,
            mitre_technique=body.mitre_technique,
            source_ip=body.source_ip,
            destination_ip=body.destination_ip,
            anomaly_score=body.anomaly_score,
            narrative=body.narrative,
            detected_at=body.detected_at,
        )
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found in this organisation",
        )
    return IncidentOut(**incident)


@router.get("", response_model=IncidentList, response_model_by_alias=True)
async def list_incidents(
    current_user: _ReadIncident,
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


@router.websocket("/stream")
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
    except (TimeoutError, WebSocketDisconnect):
        pass
    finally:
        await conn.remove_listener("incidents_changed", _on_notify)  # type: ignore[arg-type]
        await conn.close()


@router.get("/{incident_id}", response_model=IncidentOut, response_model_by_alias=True)
async def get_incident(incident_id: str, current_user: _ReadIncident) -> IncidentOut:
    async with db.get_connection() as conn:
        incident = await inc_repo.get_incident(conn, current_user["org"], incident_id)
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return IncidentOut(**incident)


@router.patch("/{incident_id}", response_model=IncidentOut, response_model_by_alias=True)
async def patch_incident(
    incident_id: str, body: IncidentPatch, current_user: _AckIncident,
) -> IncidentOut:
    valid_statuses   = {"open", "acknowledged", "confirmed", "false_positive"}
    valid_severities = {"info", "low", "medium", "high", "critical"}
    if body.status is not None and body.status not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    if body.severity is not None and body.severity not in valid_severities:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity")

    # Severity or narrative changes require a higher permission level
    if (body.severity is not None or body.narrative is not None) and \
            "incidents:write" not in ROLE_PERMISSIONS.get(current_user["role"], frozenset()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Requires permission: incidents:write"},
        )

    async with db.get_connection() as conn:
        incident = await inc_repo.patch_incident(
            conn, current_user["org"], incident_id,
            status=body.status, severity=body.severity, narrative=body.narrative,
        )
    if not incident:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")
    return IncidentOut(**incident)
