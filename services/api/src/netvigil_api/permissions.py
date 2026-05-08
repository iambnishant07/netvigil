"""RBAC permission registry.

Single source of truth for which permissions each role carries.  Use frozensets
for O(1) membership test.  Mirror this in packages/web/src/lib/permissions.ts
and packages/mobile/src/lib/permissions.ts — keep them in sync.
"""
from __future__ import annotations

from typing import Final

_ALL: frozenset[str] = frozenset({
    "incidents:read",
    "incidents:write",
    "incidents:acknowledge",
    "incidents:export",
    "devices:read",
    "devices:write",
    "alert_rules:read",
    "alert_rules:write",
    "dashboard:read",
    "users:read",
    "users:write",
    "audit_logs:read",
    "system:admin",
})

ROLE_PERMISSIONS: Final[dict[str, frozenset[str]]] = {
    "super_admin": _ALL,
    "admin": _ALL - {"system:admin"},
    "senior_analyst": frozenset({
        "incidents:read", "incidents:write", "incidents:acknowledge", "incidents:export",
        "devices:read",
        "alert_rules:read", "alert_rules:write",
        "dashboard:read",
        "users:read",
        "audit_logs:read",
    }),
    "analyst": frozenset({
        "incidents:read", "incidents:acknowledge",
        "devices:read",
        "dashboard:read",
    }),
    "threat_hunter": frozenset({
        "incidents:read", "incidents:write", "incidents:export",
        "devices:read",
        "alert_rules:read",
        "dashboard:read",
    }),
    "forensic_investigator": frozenset({
        "incidents:read", "incidents:export",
        "devices:read",
        "dashboard:read",
        "audit_logs:read",
    }),
    "auditor": frozenset({
        "incidents:read", "incidents:export",
        "devices:read",
        "dashboard:read",
        "audit_logs:read",
    }),
    "developer": frozenset({
        "devices:read", "devices:write",
        "dashboard:read",
    }),
}
