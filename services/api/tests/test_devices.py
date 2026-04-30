"""Device endpoint tests — happy path + auth failure."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

REG = "/api/v1/auth/register"
DEVICES = "/api/v1/devices"

PAYLOAD = {
    "organization_name": "DevOrg",
    "email": "devtest@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Brisbane",
}
DEVICE_BODY = {"name": "pfSense-Edge", "vendor": "pfsense", "protocol": "netflow", "publicIp": "203.0.113.1"}


async def _auth_header(client: AsyncClient) -> dict[str, str]:
    r = await client.post(REG, json=PAYLOAD)
    token = r.json().get("access_token") or r.json().get("accessToken")
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_list_devices_empty(client: AsyncClient) -> None:
    headers = await _auth_header(client)
    r = await client.get(DEVICES, headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_create_and_get_device(client: AsyncClient) -> None:
    headers = await _auth_header(client)
    r = await client.post(DEVICES, json=DEVICE_BODY, headers=headers)
    assert r.status_code == 201
    body = r.json()
    assert "sharedSecret" in body or "shared_secret" in body
    device_id = body["id"]

    r2 = await client.get(f"{DEVICES}/{device_id}", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["name"] == DEVICE_BODY["name"]


@pytest.mark.asyncio
async def test_devices_requires_auth(client: AsyncClient) -> None:
    r = await client.get(DEVICES)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_nonexistent_device_returns_404(client: AsyncClient) -> None:
    headers = await _auth_header(client)
    r = await client.get(f"{DEVICES}/00000000-0000-0000-0000-000000000000", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_device(client: AsyncClient) -> None:
    headers = await _auth_header(client)
    r = await client.post(DEVICES, json=DEVICE_BODY, headers=headers)
    device_id = r.json()["id"]
    r2 = await client.delete(f"{DEVICES}/{device_id}", headers=headers)
    assert r2.status_code == 204
