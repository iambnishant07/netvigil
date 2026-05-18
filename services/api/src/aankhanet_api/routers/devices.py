from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, status

from aankhanet_api import database as db
from aankhanet_api.deps import EffectiveOrg, require_permission
from aankhanet_api.repositories import devices as dev_repo
from aankhanet_api.schemas.devices import DeviceCreate, DeviceCreatedOut, DeviceList, DeviceOut, DeviceUpdate
from aankhanet_api.security import generate_device_secret

router = APIRouter(prefix="/devices", tags=["devices"])

_ReadDevice  = Annotated[dict[str, Any], require_permission("devices:read")]
_WriteDevice = Annotated[dict[str, Any], require_permission("devices:write")]


@router.get("", response_model=DeviceList, response_model_by_alias=True)
async def list_devices(
    current_user: _ReadDevice,
    org: EffectiveOrg,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> DeviceList:
    async with db.get_connection() as conn:
        items, total = await dev_repo.list_devices(conn, org, page, page_size)
    return DeviceList(items=[DeviceOut(**i) for i in items], page=page, page_size=page_size, total=total)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DeviceCreatedOut, response_model_by_alias=True)
async def create_device(body: DeviceCreate, current_user: _WriteDevice, org: EffectiveOrg) -> DeviceCreatedOut:
    raw_secret, secret_hash = generate_device_secret()
    lat = body.location.lat if body.location else None
    lng = body.location.lng if body.location else None
    async with db.get_connection() as conn:
        device = await dev_repo.create_device(
            conn, org, body.name, body.vendor,
            body.protocol, body.public_ip, secret_hash, lat, lng,
        )
    return DeviceCreatedOut(**device, shared_secret=raw_secret)


@router.get("/{device_id}", response_model=DeviceOut, response_model_by_alias=True)
async def get_device(device_id: str, current_user: _ReadDevice, org: EffectiveOrg) -> DeviceOut:
    async with db.get_connection() as conn:
        device = await dev_repo.get_device(conn, org, device_id)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return DeviceOut(**device)


@router.patch("/{device_id}", response_model=DeviceOut, response_model_by_alias=True)
async def update_device(device_id: str, body: DeviceUpdate, current_user: _WriteDevice, org: EffectiveOrg) -> DeviceOut:
    lat = body.location.lat if body.location else None
    lng = body.location.lng if body.location else None
    async with db.get_connection() as conn:
        device = await dev_repo.update_device(conn, org, device_id, body.name, lat, lng)
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return DeviceOut(**device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(device_id: str, current_user: _WriteDevice, org: EffectiveOrg) -> None:
    async with db.get_connection() as conn:
        deleted = await dev_repo.delete_device(conn, org, device_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
