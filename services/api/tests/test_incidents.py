"""Incident endpoint tests."""
from __future__ import annotations

import asyncpg
import pytest
from httpx import AsyncClient

from aankhanet_api.security import uuid7

REG = "/api/v1/auth/register"
INCIDENTS = "/api/v1/incidents"

PAYLOAD = {
    "organization_name": "IncOrg",
    "email": "inctest@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Brisbane",
}
DEVICE_BODY = {"name": "Core-Switch", "vendor": "mikrotik", "protocol": "syslog", "public_ip": "10.0.0.1"}


async def _setup(client: AsyncClient) -> tuple[dict, str, str]:
    r = await client.post(REG, json=PAYLOAD)
    token = r.json().get("access_token") or r.json().get("accessToken")
    org_id = r.json()["user"]["organizationId"]
    headers = {"Authorization": f"Bearer {token}"}
    dr = await client.post("/api/v1/devices", json=DEVICE_BODY, headers=headers)
    device_id = dr.json()["id"]
    return headers, org_id, device_id


async def _insert_incident(pg_pool: asyncpg.Pool, org_id: str, device_id: str) -> str:  # type: ignore[type-arg]
    iid = str(uuid7())
    async with pg_pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO incidents
                 (id, organization_id, device_id, detected_at, severity, status,
                  attack_label, mitre_technique, source_ip, destination_ip, anomaly_score)
               VALUES($1,$2,$3,now(),'critical','open','port_scan','T1046','1.2.3.4','10.0.0.5',0.9)""",
            iid, org_id, device_id,
        )
    return iid


@pytest.mark.asyncio
async def test_list_incidents_empty(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(INCIDENTS, headers=headers)
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_get_incident(client: AsyncClient, pg_pool: asyncpg.Pool) -> None:  # type: ignore[type-arg]
    headers, org_id, device_id = await _setup(client)
    iid = await _insert_incident(pg_pool, org_id, device_id)
    r = await client.get(f"{INCIDENTS}/{iid}", headers=headers)
    assert r.status_code == 200
    assert r.json()["severity"] == "critical"


@pytest.mark.asyncio
async def test_patch_incident_status(client: AsyncClient, pg_pool: asyncpg.Pool) -> None:  # type: ignore[type-arg]
    headers, org_id, device_id = await _setup(client)
    iid = await _insert_incident(pg_pool, org_id, device_id)
    r = await client.patch(f"{INCIDENTS}/{iid}", json={"status": "acknowledged"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "acknowledged"


@pytest.mark.asyncio
async def test_incidents_requires_auth(client: AsyncClient) -> None:
    r = await client.get(INCIDENTS)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_missing_incident_returns_404(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(f"{INCIDENTS}/00000000-0000-0000-0000-000000000000", headers=headers)
    assert r.status_code == 404
