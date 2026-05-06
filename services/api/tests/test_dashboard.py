"""Dashboard endpoint tests — happy path + auth failure (NFR-10)."""
from __future__ import annotations

import asyncpg
import pytest
from httpx import AsyncClient

from netvigil_api.security import uuid7

REG = "/api/v1/auth/register"
KPIS = "/api/v1/dashboard/kpis"
THREAT_MAP = "/api/v1/dashboard/threat-map"

PAYLOAD = {
    "organization_name": "DashOrg",
    "email": "dash@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Melbourne",
}
DEVICE_BODY = {
    "name": "Core-Switch",
    "vendor": "mikrotik",
    "protocol": "syslog",
    "public_ip": "10.0.0.1",
}


async def _setup(client: AsyncClient) -> tuple[dict[str, str], str, str]:
    r = await client.post(REG, json=PAYLOAD)
    assert r.status_code == 201
    token = r.json().get("access_token") or r.json().get("accessToken")
    org_id = r.json()["user"]["organizationId"]
    headers: dict[str, str] = {"Authorization": f"Bearer {token}"}
    dr = await client.post("/api/v1/devices", json=DEVICE_BODY, headers=headers)
    device_id = dr.json()["id"]
    return headers, org_id, device_id


# ── /dashboard/kpis ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_kpis_requires_auth(client: AsyncClient) -> None:
    r = await client.get(KPIS)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_kpis_returns_expected_shape(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(KPIS, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "eventsPerSecond" in body or "events_per_second" in body
    sev = body.get("openIncidentsBySeverity") or body.get("open_incidents_by_severity")
    assert sev is not None
    for level in ("critical", "high", "medium", "low", "info"):
        assert level in sev


@pytest.mark.asyncio
async def test_kpis_counts_open_incidents(client: AsyncClient, pg_pool: asyncpg.Pool) -> None:  # type: ignore[type-arg]
    headers, org_id, device_id = await _setup(client)
    iid = str(uuid7())
    async with pg_pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO incidents
                 (id, organization_id, device_id, detected_at, severity, status,
                  attack_label, mitre_technique, source_ip, destination_ip, anomaly_score)
               VALUES($1,$2,$3,now(),'critical','open','port_scan','T1046','1.2.3.4','10.0.0.5',0.9)""",
            iid, org_id, device_id,
        )
    r = await client.get(KPIS, headers=headers)
    assert r.status_code == 200
    sev = r.json().get("openIncidentsBySeverity") or r.json().get("open_incidents_by_severity")
    assert sev["critical"] >= 1


# ── /dashboard/threat-map ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_threat_map_requires_auth(client: AsyncClient) -> None:
    r = await client.get(THREAT_MAP)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_threat_map_returns_expected_shape(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(THREAT_MAP, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "center" in body
    assert "arcs" in body
    assert "lat" in body["center"]
    assert "lng" in body["center"]
    assert isinstance(body["arcs"], list)


@pytest.mark.asyncio
async def test_threat_map_hours_param(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(f"{THREAT_MAP}?hours=48", headers=headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_threat_map_invalid_hours_returns_422(client: AsyncClient) -> None:
    headers, _, _ = await _setup(client)
    r = await client.get(f"{THREAT_MAP}?hours=0", headers=headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_threat_map_builds_arcs_from_incidents(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    headers, org_id, device_id = await _setup(client)

    # Give the device a real lat/lng so the threat-map query JOIN returns results
    async with pg_pool.acquire() as conn:
        await conn.execute(
            "UPDATE devices SET location_lat = -37.8, location_lng = 145.0 WHERE id = $1::uuid",
            device_id,
        )
        iid = str(uuid7())
        # source IP 92.242.x.x maps to Moscow in _IP_GEO
        await conn.execute(
            """INSERT INTO incidents
                 (id, organization_id, device_id, detected_at, severity, status,
                  attack_label, mitre_technique, source_ip, destination_ip, anomaly_score)
               VALUES($1,$2,$3,now(),'high','open','brute_force','T1110','92.242.1.5','10.0.0.1',0.8)""",
            iid, org_id, device_id,
        )

    r = await client.get(f"{THREAT_MAP}?hours=1", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["arcs"]) >= 1
    arc = body["arcs"][0]
    assert "from" in arc or "from_" in arc  # alias="from" serialises as "from"
    assert "to" in arc
    assert arc["count"] >= 1
