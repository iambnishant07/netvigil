# ADR-0001 — pnpm workspaces for TypeScript, uv for Python

**Date:** 2025-02  
**Status:** Accepted

## Context

The project has three TypeScript packages (web, mobile, shared-types) and four Python services (api, ingestor, detector, dispatcher). We needed package managers that support:

- Shared type generation (openapi-typescript → shared-types consumed by web and mobile)
- Fast, reproducible installs in CI
- Monorepo workspace linking without `npm link` hacks

## Decision

- **pnpm workspaces** for all TypeScript packages. `workspace:*` protocol links shared-types locally without publishing to npm.
- **uv** for all Python services. Each service has its own `pyproject.toml`; `uv sync` reproduces the lockfile exactly.

## Consequences

- `npm` and `yarn` are explicitly prohibited in CLAUDE.md to avoid mixed lockfiles.
- `pip` is explicitly prohibited; `uv run` is used for all Python commands.
- CI installs with `pnpm install --frozen-lockfile` and `uv sync --frozen`.
- Shared TypeScript types flow as: edit `docs/openapi.yaml` → run `pnpm generate:types` → commit generated `packages/shared-types/src/openapi.d.ts`. Generated file is never hand-edited.
