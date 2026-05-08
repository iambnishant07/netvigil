"""RBAC / permission-gating tests — covers users, alert-rules, audit-logs endpoints."""
from __future__ import annotations

import asyncpg
import pytest
from httpx import AsyncClient

from netvigil_api.security import create_access_token, hash_password, uuid7

REG = "/api/v1/auth/register"
USERS = "/api/v1/users"
ALERT_RULES = "/api/v1/alert-rules"
AUDIT_LOGS = "/api/v1/audit-logs"

_ORG_PAYLOAD = {
    "organization_name": "RbacOrg",
    "email": "rbac-admin@example.com",
    "password": "supersecret123!",
    "timezone": "Australia/Melbourne",
}

_RULE_BODY = {
    "name": "Test Rule",
    "minSeverity": "high",
    "channel": "push",
}


async def _setup(client: AsyncClient) -> tuple[str, str, str]:
    """Register, return (admin_token, user_id, org_id)."""
    r = await client.post(REG, json=_ORG_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    token = body.get("access_token") or body.get("accessToken")
    user_id = body["user"]["id"]
    org_id = body["user"]["organizationId"]
    return token, user_id, org_id


async def _create_user_with_role(
    pg_pool: asyncpg.Pool,  # type: ignore[type-arg]
    org_id: str,
    role: str,
) -> str:
    """Insert a user with a given role directly; return a valid JWT for them."""
    uid = str(uuid7())
    async with pg_pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO users
               (id, organization_id, email, password_hash, role, mfa_enrolled, is_active)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5, FALSE, TRUE)""",
            uid, org_id,
            f"{role}-user-{uid[:8]}@example.com",
            hash_password("unused"),
            role,
        )
    return create_access_token(uid, org_id, role)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Users endpoint ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_users_requires_auth(client: AsyncClient) -> None:
    r = await client.get(USERS)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_users_analyst_returns_403(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    analyst_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    r = await client.get(USERS, headers=_auth(analyst_tok))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_users_admin_sees_own_account(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.get(USERS, headers=_auth(token))
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert _ORG_PAYLOAD["email"] in emails


@pytest.mark.asyncio
async def test_patch_user_role_requires_users_write(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    analyst_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    fake_target = str(uuid7())
    r = await client.patch(
        f"{USERS}/{fake_target}",
        json={"role": "analyst"},
        headers=_auth(analyst_tok),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_user_role_admin_succeeds(client: AsyncClient) -> None:
    token, user_id, _ = await _setup(client)
    r = await client.patch(
        f"{USERS}/{user_id}",
        json={"role": "senior_analyst"},
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert r.json()["role"] == "senior_analyst"


@pytest.mark.asyncio
async def test_patch_user_is_active_admin_succeeds(client: AsyncClient) -> None:
    token, user_id, _ = await _setup(client)
    r = await client.patch(
        f"{USERS}/{user_id}",
        json={"isActive": False},
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert r.json()["isActive"] is False


@pytest.mark.asyncio
async def test_patch_user_empty_body_returns_400(client: AsyncClient) -> None:
    token, user_id, _ = await _setup(client)
    r = await client.patch(f"{USERS}/{user_id}", json={}, headers=_auth(token))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_patch_user_unknown_id_returns_404(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    fake_id = str(uuid7())
    r = await client.patch(
        f"{USERS}/{fake_id}",
        json={"role": "analyst"},
        headers=_auth(token),
    )
    assert r.status_code == 404


# ── Alert rules endpoint ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_alert_rules_requires_auth(client: AsyncClient) -> None:
    r = await client.get(ALERT_RULES)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_alert_rules_analyst_returns_403(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    analyst_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    r = await client.get(ALERT_RULES, headers=_auth(analyst_tok))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_list_alert_rules_empty(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.get(ALERT_RULES, headers=_auth(token))
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_alert_rule_admin_succeeds(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.post(ALERT_RULES, json=_RULE_BODY, headers=_auth(token))
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == _RULE_BODY["name"]
    assert body["minSeverity"] == _RULE_BODY["minSeverity"]


@pytest.mark.asyncio
async def test_create_alert_rule_analyst_returns_403(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    analyst_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    r = await client.post(ALERT_RULES, json=_RULE_BODY, headers=_auth(analyst_tok))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_patch_alert_rule(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    create_r = await client.post(ALERT_RULES, json=_RULE_BODY, headers=_auth(token))
    rule_id = create_r.json()["id"]
    r = await client.patch(
        f"{ALERT_RULES}/{rule_id}",
        json={"enabled": False},
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert r.json()["enabled"] is False


@pytest.mark.asyncio
async def test_patch_alert_rule_not_found(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.patch(
        f"{ALERT_RULES}/{uuid7()}",
        json={"enabled": False},
        headers=_auth(token),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_alert_rule(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    create_r = await client.post(ALERT_RULES, json=_RULE_BODY, headers=_auth(token))
    rule_id = create_r.json()["id"]
    r = await client.delete(f"{ALERT_RULES}/{rule_id}", headers=_auth(token))
    assert r.status_code == 204


@pytest.mark.asyncio
async def test_delete_alert_rule_not_found(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.delete(f"{ALERT_RULES}/{uuid7()}", headers=_auth(token))
    assert r.status_code == 404


# ── Audit logs endpoint ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_logs_requires_auth(client: AsyncClient) -> None:
    r = await client.get(AUDIT_LOGS)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_audit_logs_analyst_returns_403(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    analyst_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    r = await client.get(AUDIT_LOGS, headers=_auth(analyst_tok))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_audit_logs_admin_can_read(client: AsyncClient) -> None:
    token, _, _ = await _setup(client)
    r = await client.get(AUDIT_LOGS, headers=_auth(token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_audit_logs_written_after_user_patch(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    """Patching another user should produce an audit log entry readable by admin."""
    token, _, org_id = await _setup(client)
    target_tok = await _create_user_with_role(pg_pool, org_id, "analyst")
    # decode target user_id from the token payload
    from netvigil_api.security import decode_access_token
    target_id = decode_access_token(target_tok)["sub"]

    await client.patch(
        f"{USERS}/{target_id}",
        json={"role": "developer"},
        headers=_auth(token),
    )
    r = await client.get(AUDIT_LOGS, headers=_auth(token))
    assert r.status_code == 200
    actions = [e["action"] for e in r.json()]
    assert "user.update" in actions


@pytest.mark.asyncio
async def test_audit_logs_auditor_role_can_read(
    client: AsyncClient, pg_pool: asyncpg.Pool  # type: ignore[type-arg]
) -> None:
    _, _, org_id = await _setup(client)
    auditor_tok = await _create_user_with_role(pg_pool, org_id, "auditor")
    r = await client.get(AUDIT_LOGS, headers=_auth(auditor_tok))
    assert r.status_code == 200
