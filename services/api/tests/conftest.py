"""Test fixtures — requires postgres running (docker compose up -d postgres)."""
from __future__ import annotations

import os

import asyncpg
import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("JWT_PRIVATE_KEY", _PRIV := (
    "-----BEGIN RSA PRIVATE KEY-----\n"
    "MIIEowIBAAKCAQEA2a2rwplBQLF29amygykEMmYz0+Kcj3bKBp29Fe9UtXSBhBYN\n"
    "7DTDNY2ODhBHpg2yvwhKqBCQiqZD0bFSYJDjWFVAEWiuHFcpCFwgRdSPBMlQpFfA\n"
    "VCBLtGw3M+xD2aCxMFTNNbhJaEEBpFBRvV3lCqkuuV4WM7M3lB8UICRV8E0f3D5i\n"
    "f2bxjrmrNI0EQHQB9lGUYV3EzRbYQV2CK4FKR69yblWXUFEVEW7aSb0PqAtbCVe2\n"
    "p+MSuMLNQ9iFa8R8YFpzKpU4nCBQWEj7VqJH+NXfGHaopTpmpZr2/VqTR2HnIxw0\n"
    "k4QRQW0MRSxDQmabAx/6CdQSKYAm3wIDAQABAoIBAHH6xQH0qCMaYVqUYEGsBdCO\n"
    "PLACEHOLDER_ONLY_DO_NOT_USE_IN_PROD\n"
    "-----END RSA PRIVATE KEY-----"
))
os.environ.setdefault("JWT_PUBLIC_KEY", _PUB := (
    "-----BEGIN PUBLIC KEY-----\n"
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLF29amygykE\n"
    "PLACEHOLDER_ONLY_DO_NOT_USE_IN_PROD\n"
    "-----END PUBLIC KEY-----"
))

# Patch settings + security to use a real key pair generated at import time
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

_REAL_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_REAL_PRIV = _REAL_KEY.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.TraditionalOpenSSL,
    serialization.NoEncryption(),
).decode()
_REAL_PUB = _REAL_KEY.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
).decode()

os.environ["JWT_PRIVATE_KEY"] = _REAL_PRIV.replace("\n", "\\n")
os.environ["JWT_PUBLIC_KEY"]  = _REAL_PUB.replace("\n",  "\\n")

# Re-import settings after env override
import importlib
import aankhanet_api.config as _cfg_mod
import aankhanet_api.database as _db_mod
import aankhanet_api.security as _sec_mod
_cfg_mod.settings = _cfg_mod.Settings()
importlib.reload(_sec_mod)

from aankhanet_api.main import app  # noqa: E402


DB_URL = (
    f"postgresql://{os.getenv('POSTGRES_USER','aankhanet')}:"
    f"{os.getenv('POSTGRES_PASSWORD','devpassword')}@"
    f"{os.getenv('POSTGRES_HOST','localhost')}:"
    f"{os.getenv('POSTGRES_PORT','5432')}/"
    f"{os.getenv('POSTGRES_DB','aankhanet')}"
)


@pytest.fixture(scope="session")
async def pg_pool() -> asyncpg.Pool:  # type: ignore[type-arg]
    pool = await asyncpg.create_pool(DB_URL)
    _db_mod._pool = pool  # wire the app module so endpoints can use it without lifespan
    yield pool  # type: ignore[misc]
    await pool.close()
    _db_mod._pool = None


@pytest.fixture(autouse=True)
async def clean_db(pg_pool: asyncpg.Pool) -> None:  # type: ignore[type-arg]
    yield
    async with pg_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM audit_logs; DELETE FROM alert_rules; DELETE FROM incidents; "
            "DELETE FROM devices; DELETE FROM refresh_tokens; DELETE FROM users; "
            "DELETE FROM organizations;"
        )


@pytest.fixture()
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c  # type: ignore[misc]
