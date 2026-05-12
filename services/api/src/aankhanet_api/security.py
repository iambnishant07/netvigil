from __future__ import annotations

import hashlib
import os
import secrets
import time
import uuid
from typing import Any

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from aankhanet_api.config import settings

# Argon2id: m=64MiB, t=3, p=4 (per CLAUDE.md)
_ph = PasswordHasher(memory_cost=65_536, time_cost=3, parallelism=4)


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _ph.hash(plain)


def verify_password(hashed: str, plain: str) -> bool:
    try:
        return _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError):
        return False


# ── UUIDv7 ────────────────────────────────────────────────────────────────────

def uuid7() -> uuid.UUID:
    """Time-ordered UUID v7 (RFC 9562)."""
    ms = int(time.time() * 1000)
    rand = os.urandom(10)
    rand_a = int.from_bytes(rand[:2], "big") & 0x0FFF
    rand_b = int.from_bytes(rand[2:], "big") & 0x3FFF_FFFF_FFFF_FFFF
    val = (ms << 80) | (0x7 << 76) | (rand_a << 64) | (0x2 << 62) | rand_b
    return uuid.UUID(int=val)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_access_token(user_id: str, org_id: str, role: str) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub":  user_id,
        "org":  org_id,
        "role": role,
        "jti":  str(uuid7()),
        "iat":  now,
        "exp":  now + settings.jwt_access_token_ttl,
    }
    return jwt.encode(payload, settings.private_key_pem(), algorithm="RS256")


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.public_key_pem(), algorithms=["RS256"])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


# ── Refresh tokens ────────────────────────────────────────────────────────────

def generate_refresh_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hash). Store only the hash."""
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ── MFA / TOTP ────────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def get_totp_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="AankhaNet")


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def create_mfa_token(user_id: str) -> str:
    """Short-lived (5 min) JWT that proves password was verified but MFA pending."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": user_id,
        "typ": "mfa",
        "jti": str(uuid7()),
        "iat": now,
        "exp": now + 300,
    }
    return jwt.encode(payload, settings.private_key_pem(), algorithm="RS256")


def decode_mfa_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.public_key_pem(), algorithms=["RS256"])
        if payload.get("typ") != "mfa":
            raise ValueError("Not an MFA token")
        return str(payload["sub"])
    except JWTError as exc:
        raise ValueError("Invalid MFA token") from exc


def create_google_session_token(google_sub: str, email: str) -> str:
    """Short-lived (10 min) JWT proving Google identity while org/role selection is pending."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub":   google_sub,
        "email": email,
        "typ":   "google_session",
        "jti":   str(uuid7()),
        "iat":   now,
        "exp":   now + 600,
    }
    return jwt.encode(payload, settings.private_key_pem(), algorithm="RS256")


def decode_google_session_token(token: str) -> dict[str, str]:
    try:
        payload = jwt.decode(token, settings.public_key_pem(), algorithms=["RS256"])
        if payload.get("typ") != "google_session":
            raise ValueError("Not a Google session token")
        return {"google_sub": str(payload["sub"]), "email": str(payload["email"])}
    except JWTError as exc:
        raise ValueError("Invalid Google session token") from exc


# ── Shared device secret ──────────────────────────────────────────────────────

def generate_device_secret() -> tuple[str, str]:
    """Return (raw_secret, argon2_hash). Store only the hash."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_password(raw)
