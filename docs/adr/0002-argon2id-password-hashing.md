# ADR-0002 — Argon2id for password hashing

**Date:** 2025-02  
**Status:** Accepted

## Context

Password hashing algorithm choice directly affects both security posture and login latency. Common options considered:

| Algorithm | Memory-hard | PHC winner | OWASP recommended |
|-----------|-------------|------------|-------------------|
| bcrypt | No | No | Acceptable |
| PBKDF2 | No | No | Acceptable |
| scrypt | Yes | No | Acceptable |
| **Argon2id** | **Yes** | **Yes** | **Preferred** |

The university capstone proposal explicitly commits to Argon2id, and markers are expected to check this.

## Decision

Use **Argon2id** with parameters `m=64 MiB, t=3, p=4` via the `argon2-cffi` Python library.

## Consequences

- Login on a constrained dev machine (≤ 1 GB free RAM) will appear to "hang" for 1–2 seconds — this is normal, not a bug. Do not lower `m` to compensate.
- bcrypt, PBKDF2, and plain SHA-* are hard-prohibited in CLAUDE.md.
- The `verify_password` and `hash_password` functions in `services/api/src/netvigil_api/security.py` are the only permitted call sites.
