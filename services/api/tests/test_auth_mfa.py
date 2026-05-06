"""MFA endpoint tests — happy path + auth failure (NFR-10)."""
from __future__ import annotations

import pyotp
import pytest
from httpx import AsyncClient

REG = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
MFA_SETUP = "/api/v1/auth/mfa/setup"
MFA_VERIFY = "/api/v1/auth/mfa/verify"
MFA_DISABLE = "/api/v1/auth/mfa/disable"
MFA_CHALLENGE = "/api/v1/auth/mfa/challenge"

PAYLOAD = {
    "organization_name": "MfaOrg",
    "email": "mfa@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Melbourne",
}


async def _register_and_token(client: AsyncClient) -> str:
    r = await client.post(REG, json=PAYLOAD)
    assert r.status_code == 201
    return r.json().get("access_token") or r.json().get("accessToken")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Setup ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mfa_setup_requires_auth(client: AsyncClient) -> None:
    r = await client.post(MFA_SETUP)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mfa_setup_returns_provisioning_uri(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    r = await client.post(MFA_SETUP, headers=_auth(token))
    assert r.status_code == 200
    body = r.json()
    key = "provisioning_uri" if "provisioning_uri" in body else "provisioningUri"
    assert "otpauth://" in body[key]


# ── Verify ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mfa_verify_valid_code_enrolls_mfa(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    setup_r = await client.post(MFA_SETUP, headers=_auth(token))
    uri = setup_r.json().get("provisioning_uri") or setup_r.json().get("provisioningUri")
    totp = pyotp.parse_uri(uri)
    code = totp.now()
    r = await client.post(MFA_VERIFY, json={"code": code}, headers=_auth(token))
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_mfa_verify_wrong_code_returns_401(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    await client.post(MFA_SETUP, headers=_auth(token))
    r = await client.post(MFA_VERIFY, json={"code": "000000"}, headers=_auth(token))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mfa_verify_without_setup_returns_400(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    r = await client.post(MFA_VERIFY, json={"code": "123456"}, headers=_auth(token))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_mfa_verify_requires_auth(client: AsyncClient) -> None:
    r = await client.post(MFA_VERIFY, json={"code": "123456"})
    assert r.status_code == 401


# ── Disable ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mfa_disable_valid_code_removes_mfa(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    setup_r = await client.post(MFA_SETUP, headers=_auth(token))
    uri = setup_r.json().get("provisioning_uri") or setup_r.json().get("provisioningUri")
    totp = pyotp.parse_uri(uri)

    await client.post(MFA_VERIFY, json={"code": totp.now()}, headers=_auth(token))
    r = await client.post(MFA_DISABLE, json={"code": totp.now()}, headers=_auth(token))
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_mfa_disable_wrong_code_returns_401(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    setup_r = await client.post(MFA_SETUP, headers=_auth(token))
    uri = setup_r.json().get("provisioning_uri") or setup_r.json().get("provisioningUri")
    totp = pyotp.parse_uri(uri)
    await client.post(MFA_VERIFY, json={"code": totp.now()}, headers=_auth(token))

    r = await client.post(MFA_DISABLE, json={"code": "000000"}, headers=_auth(token))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mfa_disable_not_enrolled_returns_400(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    r = await client.post(MFA_DISABLE, json={"code": "123456"}, headers=_auth(token))
    assert r.status_code == 400


# ── Challenge (login with MFA) ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mfa_challenge_full_flow(client: AsyncClient) -> None:
    """Register → enroll MFA → login returns mfa_required → challenge → full tokens."""
    token = await _register_and_token(client)
    setup_r = await client.post(MFA_SETUP, headers=_auth(token))
    uri = setup_r.json().get("provisioning_uri") or setup_r.json().get("provisioningUri")
    totp = pyotp.parse_uri(uri)
    await client.post(MFA_VERIFY, json={"code": totp.now()}, headers=_auth(token))

    login_r = await client.post(LOGIN, json={"email": PAYLOAD["email"], "password": PAYLOAD["password"]})
    assert login_r.status_code == 200
    body = login_r.json()
    mfa_required = body.get("mfa_required") or body.get("mfaRequired")
    mfa_token = body.get("mfa_token") or body.get("mfaToken")
    assert mfa_required is True
    assert mfa_token is not None

    challenge_r = await client.post(MFA_CHALLENGE, json={"mfa_token": mfa_token, "code": totp.now()})
    assert challenge_r.status_code == 200
    assert challenge_r.json().get("access_token") or challenge_r.json().get("accessToken")


@pytest.mark.asyncio
async def test_mfa_challenge_invalid_mfa_token_returns_401(client: AsyncClient) -> None:
    r = await client.post(MFA_CHALLENGE, json={"mfa_token": "not-a-jwt", "code": "123456"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_mfa_challenge_wrong_totp_returns_401(client: AsyncClient) -> None:
    token = await _register_and_token(client)
    setup_r = await client.post(MFA_SETUP, headers=_auth(token))
    uri = setup_r.json().get("provisioning_uri") or setup_r.json().get("provisioningUri")
    totp = pyotp.parse_uri(uri)
    await client.post(MFA_VERIFY, json={"code": totp.now()}, headers=_auth(token))

    login_r = await client.post(LOGIN, json={"email": PAYLOAD["email"], "password": PAYLOAD["password"]})
    mfa_token = login_r.json().get("mfa_token") or login_r.json().get("mfaToken")

    r = await client.post(MFA_CHALLENGE, json={"mfa_token": mfa_token, "code": "000000"})
    assert r.status_code == 401
