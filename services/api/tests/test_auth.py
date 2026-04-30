"""Auth endpoint tests — happy path + auth failure (NFR-10)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

REG = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
ME = "/api/v1/auth/me"

PAYLOAD = {
    "organization_name": "TestOrg",
    "email": "test@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Melbourne",
}


@pytest.mark.asyncio
async def test_register_creates_org_and_returns_tokens(client: AsyncClient) -> None:
    r = await client.post(REG, json=PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert body.get("access_token") or body.get("accessToken")
    assert body["user"]["email"] == PAYLOAD["email"]
    assert body["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_register_duplicate_email_returns_409(client: AsyncClient) -> None:
    await client.post(REG, json=PAYLOAD)
    r = await client.post(REG, json=PAYLOAD)
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_login_happy_path(client: AsyncClient) -> None:
    await client.post(REG, json=PAYLOAD)
    r = await client.post(LOGIN, json={"email": PAYLOAD["email"], "password": PAYLOAD["password"]})
    assert r.status_code == 200
    assert "access_token" in r.json() or "accessToken" in r.json()


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(client: AsyncClient) -> None:
    await client.post(REG, json=PAYLOAD)
    r = await client.post(LOGIN, json={"email": PAYLOAD["email"], "password": "wrongpassword"})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "invalid_credentials"


@pytest.mark.asyncio
async def test_login_unknown_email_returns_401(client: AsyncClient) -> None:
    r = await client.post(LOGIN, json={"email": "nobody@example.com", "password": "doesntmatter"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client: AsyncClient) -> None:
    r = await client.get(ME)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_user(client: AsyncClient) -> None:
    reg = await client.post(REG, json=PAYLOAD)
    token = reg.json().get("access_token") or reg.json().get("accessToken")
    r = await client.get(ME, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == PAYLOAD["email"]


@pytest.mark.asyncio
async def test_refresh_rotates_token(client: AsyncClient) -> None:
    reg = await client.post(REG, json=PAYLOAD)
    rt = reg.json().get("refresh_token") or reg.json().get("refreshToken")
    r = await client.post(REFRESH, json={"refresh_token": rt})
    assert r.status_code == 200
    new_rt = r.json().get("refresh_token") or r.json().get("refreshToken")
    assert new_rt != rt


@pytest.mark.asyncio
async def test_refresh_invalid_token_returns_401(client: AsyncClient) -> None:
    r = await client.post(REFRESH, json={"refresh_token": "not-a-valid-token"})
    assert r.status_code == 401
