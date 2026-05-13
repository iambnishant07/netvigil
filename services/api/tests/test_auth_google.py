"""Google OAuth + push-token endpoint tests — happy path + auth failure (NFR-10)."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

REG = "/api/v1/auth/register"
GOOGLE = "/api/v1/auth/google"
GOOGLE_COMPLETE = "/api/v1/auth/google/complete"
PUSH_TOKEN = "/api/v1/auth/me/push-token"

REG_PAYLOAD = {
    "organization_name": "GoogleOrg",
    "email": "existing@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Melbourne",
}

_GOOGLE_SUB = "google-sub-12345"
_GOOGLE_EMAIL = "google-user@gmail.com"

_VALID_TOKENINFO = {
    "sub": _GOOGLE_SUB,
    "email": _GOOGLE_EMAIL,
    "email_verified": "true",
    "aud": "client-id.apps.googleusercontent.com",
}


def _mock_tokeninfo(payload: dict, status_code: int = 200) -> MagicMock:  # type: ignore[type-arg]
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = payload
    mock_get = AsyncMock(return_value=mock_resp)
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=MagicMock(get=mock_get))
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


# ── Google OAuth ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_auth_invalid_token_returns_401(client: AsyncClient) -> None:
    mock_client = _mock_tokeninfo({}, status_code=400)
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client):
        r = await client.post(GOOGLE, json={"id_token": "bad-token", "organization_name": "Org"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_google_auth_missing_sub_returns_401(client: AsyncClient) -> None:
    mock_client = _mock_tokeninfo({"email": _GOOGLE_EMAIL})  # no sub
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client):
        r = await client.post(GOOGLE, json={"id_token": "tok", "organization_name": "Org"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_google_auth_creates_new_user_and_org(client: AsyncClient) -> None:
    """New Google user: step 1 returns needsOrgSelection, step 2 creates org and issues token."""
    mock_client = _mock_tokeninfo(_VALID_TOKENINFO)
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client):
        r1 = await client.post(GOOGLE, json={"id_token": "valid-tok"})
    assert r1.status_code == 200
    step1 = r1.json()
    assert step1.get("needsOrgSelection") is True
    session_token = step1.get("googleSessionToken")
    assert session_token

    r2 = await client.post(
        GOOGLE_COMPLETE,
        json={"googleSessionToken": session_token, "organizationName": "GOrg"},
    )
    assert r2.status_code == 200
    body = r2.json()
    assert body.get("accessToken")
    assert body["user"]["email"] == _GOOGLE_EMAIL
    assert body["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_google_auth_links_to_existing_email(client: AsyncClient) -> None:
    """If email already exists via password, Google sub is linked and token issued directly."""
    await client.post(REG, json=REG_PAYLOAD)

    tokeninfo = {**_VALID_TOKENINFO, "email": REG_PAYLOAD["email"], "sub": "new-google-sub"}
    mock_client = _mock_tokeninfo(tokeninfo)
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client):
        r = await client.post(GOOGLE, json={"id_token": "valid-tok"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == REG_PAYLOAD["email"]


@pytest.mark.asyncio
async def test_google_auth_second_login_uses_existing_sub(client: AsyncClient) -> None:
    """Same Google sub on second call should return the same user without org selection."""
    # Step 1: create the user via two-step flow
    mock_client = _mock_tokeninfo(_VALID_TOKENINFO)
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client):
        r1 = await client.post(GOOGLE, json={"id_token": "tok"})
    session_token = r1.json()["googleSessionToken"]
    create_r = await client.post(
        GOOGLE_COMPLETE,
        json={"googleSessionToken": session_token, "organizationName": "GOrg"},
    )
    uid1 = create_r.json()["user"]["id"]

    # Step 2: second login with same sub — should return same user directly
    mock_client2 = _mock_tokeninfo(_VALID_TOKENINFO)
    with patch("aankhanet_api.routers.auth.httpx.AsyncClient", return_value=mock_client2):
        r2 = await client.post(GOOGLE, json={"id_token": "tok"})
    uid2 = r2.json()["user"]["id"]

    assert uid1 == uid2


# ── Push token ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_push_token_requires_auth(client: AsyncClient) -> None:
    r = await client.put(PUSH_TOKEN, json={"pushToken": "ExponentPushToken[test]"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_push_token_stores_token(client: AsyncClient) -> None:
    reg = await client.post(REG, json=REG_PAYLOAD)
    token = reg.json().get("access_token") or reg.json().get("accessToken")
    r = await client.put(
        PUSH_TOKEN,
        json={"pushToken": "ExponentPushToken[abc123]"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 204
