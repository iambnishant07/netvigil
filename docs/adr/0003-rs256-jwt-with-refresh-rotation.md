# ADR-0003 — RS256 JWTs with rotating refresh tokens

**Date:** 2025-02  
**Status:** Accepted

## Context

The platform needs stateless authentication that works across three surfaces (web SPA, React Native mobile, FastAPI backend) with the following requirements:

- Short-lived sessions to limit blast radius of token theft
- Mobile apps must survive background/foreground cycles without re-login
- The API must be able to verify tokens without a database round-trip on every request
- Key rotation must be possible without redeploying all clients

Symmetric HMAC (HS256) was ruled out because it requires the same secret on every service that needs to verify tokens — a problem as the system scales to multiple verifying services.

## Decision

- **RS256** asymmetric signing: private key in Railway Secrets Manager (dev: `.env`), public key distributed to any verifying service.
- **Access token TTL: 15 minutes** — short enough to limit exposure if intercepted.
- **Refresh token TTL: 7 days** — stored hashed in PostgreSQL, single-use (rotated on each refresh call). Theft of a refresh token is detectable via reuse detection.
- JWT claims: `{ sub, org, role, jti, iat, exp }`. The `jti` (JWT ID) is a UUIDv7 stored server-side to enable per-token revocation if needed.

## Consequences

- Private key must never be committed to the repository. `.env.example` shows the key name; `CLAUDE.md` explicitly prohibits committing real key values.
- Access token is stored in memory only (web: React context; mobile: not persisted between cold starts — refresh token in SecureStore handles re-hydration).
- Refresh token rotation means a network race condition (two concurrent refreshes) could invalidate a valid session. Acceptable for this use case; mitigated by the 15-minute access token window.
