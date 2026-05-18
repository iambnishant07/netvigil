# ADR-0005 — Wrap asyncpg connections in an explicit transaction for RLS

**Date:** 2026-05  
**Status:** Accepted

## Context

PostgreSQL Row-Level Security relies on the session variable `app.current_org`
being set before any tenant-scoped query executes. We set it with:

```sql
SELECT set_config('app.current_org', $1, TRUE)
```

The `TRUE` argument makes the setting *transaction-local* — it is reset at
transaction commit or rollback. This is intentional: it prevents a connection
pool connection from leaking one tenant's context to another.

However, asyncpg operates in **autocommit mode** by default. Each SQL statement
is its own implicit transaction. When `set_config(is_local=TRUE)` commits its
implicit transaction the setting is immediately discarded, so the next `SELECT`
on the same connection sees no `app.current_org` and the RLS policy expression
`current_setting('app.current_org')::uuid` raises an error or returns all rows
(when `current_setting` has a default fallback).

This caused a production bug where all organisations' data was visible to all
users — the RLS policy was evaluating an empty string, not a UUID, and some
PostgreSQL versions silently coerce the empty string to nil, disabling the filter.

## Decision

Wrap every `pool.acquire()` context in `conn.transaction()` inside the
`get_connection(org_id)` helper in `services/api/src/aankhanet_api/database.py`:

```python
async with pool.acquire() as conn:
    async with conn.transaction():
        if org_id:
            await conn.execute(
                "SELECT set_config('app.current_org', $1, TRUE)", org_id
            )
        yield conn
```

The explicit transaction keeps the `set_config` value live until the entire
`async with get_connection()` block exits, at which point asyncpg commits the
transaction and the setting is discarded — exactly the isolation we want.

## Consequences

- Every API request now runs inside a database transaction. This is a minor
  write-amplification increase (BEGIN/COMMIT per request) but negligible at
  our scale and actually beneficial for atomicity.
- The `org_id` parameter is optional: internal or auth endpoints that do not
  need RLS can call `get_connection()` (no argument) and still benefit from
  the transaction wrapper for atomicity.
- All ad-hoc `await conn.execute("SELECT set_config...")` calls that previously
  existed inside individual routers have been removed; the single call inside
  `get_connection` is the only allowed location.
