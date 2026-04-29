# NetVigil — Claude Code Operating Manual

> Read this file at the start of every session. It is the single source of
> truth for project conventions. If a request conflicts with what is written
> here, stop and ask the user before proceeding.

## 1. What we are building

**NetVigil** is an AI-driven Network Detection and Response (NDR) platform
targeted at Australian small and medium-sized businesses. It is the capstone
project for NIT3003/NIT3004 at Victoria University, built by a three-person
team: Networks & Systems (lead), Cybersecurity, and Mobile App Development.

End state at the end of NIT3003 (≥ 80% of MVP):

- Ingest Syslog, NetFlow v9, and pcap from SMB network gear.
- Run an AI ensemble (Isolation Forest + autoencoder + XGBoost) to detect
  and classify network anomalies.
- Persist incidents with MITRE ATT&CK mapping and an LLM-generated narrative.
- Display incidents on a real-time web dashboard and a mobile SOC companion app.
- Dispatch alerts via email, SMS, and push.

Out of scope for the capstone: active intrusion prevention, endpoint EDR,
multi-tenant billing, SOC 2 / ISO 27001 certification, TLS payload inspection.

## 2. Repository layout

This is a **pnpm workspaces monorepo** for the TypeScript code, with a
sibling Python project for the backend and ML workers.

```
netvigil/
├── CLAUDE.md                  # this file
├── README.md
├── pnpm-workspace.yaml
├── package.json               # root, dev tooling only
├── tsconfig.base.json
├── .github/workflows/         # CI
├── docs/
│   ├── openapi.yaml           # API contract — single source of truth
│   ├── architecture.md
│   └── adr/                   # one file per architecture decision
├── packages/
│   ├── shared-types/          # @netvigil/shared-types — TS types generated
│   │                          # from openapi.yaml; never edit by hand
│   ├── web/                   # @netvigil/web — Vite + React 18 + TS + Tailwind
│   ├── mobile/                # @netvigil/mobile — Expo + React Native + TS
│   └── mock-api/              # @netvigil/mock-api — MSW handlers for dev
└── services/
    ├── api/                   # FastAPI gateway (Python 3.12)
    ├── ingestor/              # Syslog/NetFlow/pcap collectors (Python)
    ├── detector/              # AI workers — sklearn, PyTorch, XGBoost
    └── dispatcher/            # Alert fan-out (Python)
```

## 3. Tech stack — non-negotiable

Do not swap any of these without explicit user approval. The proposal
commits to them, and changing them costs us the proposal narrative.

| Layer | Tech |
|---|---|
| Web frontend | React 18, TypeScript (strict), Vite, Tailwind, React Router 6, TanStack Query, Recharts |
| Mobile | React Native via Expo (managed), TypeScript (strict), React Navigation, TanStack Query, Expo Notifications, expo-local-authentication |
| Maps | Mapbox GL JS (web), `@rnmapbox/maps` (mobile) — share access token via env |
| Backend API | Python 3.12, FastAPI, Pydantic v2, uvicorn |
| Streaming | Apache Kafka (KRaft mode in dev) |
| Time-series | InfluxDB 2.x |
| Relational | PostgreSQL 16 (Row-Level Security on all tenant tables) |
| ML | scikit-learn (Isolation Forest), PyTorch (autoencoder), XGBoost (classifier) |
| Cache / queues | Redis 7 |
| LLM | Anthropic Claude API via the official `anthropic` Python SDK |
| Auth | Argon2id passwords, RS256 JWT (15 min access, 7 day refresh), Google OAuth2 |
| Infra (dev) | docker-compose |
| Infra (cloud) | AWS — ECS Fargate, RDS, ElastiCache, S3 |
| CI | GitHub Actions |
| Package manager (TS) | **pnpm** — never npm, never yarn |
| Package manager (Py) | `uv` — never pip directly |

## 4. Conventions

### TypeScript

- `strict: true` everywhere. **No `any`.** If you genuinely need an escape hatch
  use `unknown` and narrow it.
- File names: `kebab-case.ts`. React components: `PascalCase.tsx`.
- One default export per component file; named exports for hooks and utils.
- Props always typed as a named interface, not inline.
- Async data fetching only through TanStack Query — never raw `useEffect + fetch`.
- Validation at trust boundaries with Zod; types derived with `z.infer`.

### Python

- Python 3.12, type hints on every public function, `from __future__ import annotations`.
- `ruff` for lint, `ruff format` for formatting, `mypy --strict` for types.
- FastAPI: routes thin, business logic in services, persistence in repositories.
- Pydantic v2 models for every request/response body.

### Shared types

Types in `packages/shared-types` are **generated** from `docs/openapi.yaml`
using `openapi-typescript`. Do not edit the generated file. To change a type,
edit the OpenAPI spec, then regenerate.

### Database

- Every tenant-scoped table has `organization_id UUID NOT NULL` and an RLS
  policy `USING (organization_id = current_setting('app.current_org')::uuid)`.
- All timestamps are `timestamptz`, never `timestamp`.
- All IDs are UUIDv7 (time-ordered) generated in the application layer.
- Migrations via Alembic, one migration per logical change, never edit a
  merged migration.

### Git

- Trunk-based. Short-lived feature branches, squash-merge to `main`.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Every PR must pass: typecheck, lint, tests, build. CI enforces this.
- Co-authored commits when the agent contributed materially:
  `Co-authored-by: Claude <noreply@anthropic.com>`.

### Testing targets (NFR-10 in the proposal)

- Backend Python: ≥ 70% line coverage (`pytest --cov`).
- Mobile/Web: ≥ 60% line coverage (`vitest --coverage`, `jest --coverage`).
- Every API endpoint has at least one happy-path and one auth-failure test.

## 5. Security rules — these are hard

- **Argon2id** for passwords (`m=64MiB, t=3, p=4`). Never bcrypt, never PBKDF2,
  never plain SHA-anything.
- **TLS 1.3** for all external traffic. HSTS one year. Redirect HTTP → HTTPS.
- **JWTs signed with RS256**, key pair from AWS Secrets Manager (or a local
  `.env` for dev — never committed). Access token TTL 15 minutes, refresh 7 days.
- **Parameterised queries only.** No string concatenation into SQL, ever.
- **Generic auth-failure messages** ("invalid credentials") — never reveal
  whether the user exists.
- **No secrets in the repo.** `.env.example` shows the keys; real values are
  injected at runtime. CI uses GitHub Encrypted Secrets.
- **OWASP ZAP baseline scan** runs weekly in CI; zero High findings is the gate.
- The user-facing rule: when in doubt about whether something is safe to log,
  ship, or commit — **stop and ask**.

## 6. NFR budgets

These are commitments to the marker. The agent should refuse changes that
visibly violate them and surface a warning instead.

| ID | Budget |
|---|---|
| NFR-04 | Packet → mobile push p95 ≤ 5 s |
| NFR-05 | Dashboard API GET p95 ≤ 250 ms with 1M historical incidents |
| NFR-07 | Hosted demo ≥ 99.5% monthly uptime |
| NFR-08 | Single-node ingestion ≥ 5,000 events/sec sustained |

## 7. Working style — how the user wants you to behave

1. **Plan before you edit.** For any task touching more than one file or worth
   more than ten minutes of work, write a plan first and wait for approval.
   Trivial fixes can skip this.
2. **Small, logical commits.** Stop and commit at every meaningful checkpoint.
   Never produce a 50-file mega-diff.
3. **Run the tests and the typechecker before declaring done.** "Looks right"
   is not done.
4. **Ask, don't assume.** If a requirement is ambiguous, ask one specific
   question rather than guess. The user prefers one round-trip over rework.
5. **Cite the spec.** When implementing something covered by `docs/openapi.yaml`
   or this file, reference the section ID in the commit message.
6. **No silent dependency additions.** New runtime dependencies require user
   approval. Dev dependencies (lint, test) you can add freely if standard.
7. **No mocked tests that always pass.** A test that doesn't fail when the
   implementation is broken is worse than no test.

## 8. Things that are easy to get wrong here — read these

- **CICIDS2017 dataset** has known label issues; cite Engelen et al. (2021)
  if you use the cleaned version. Don't quote raw accuracy numbers without
  context — markers will know.
- **MITRE ATT&CK technique IDs** change occasionally (deprecations, splits).
  Pin to the version in `docs/architecture.md` and don't auto-update.
- **NetFlow v9 templates** are vendor-specific. Test ingestion against
  pfSense and MikroTik exporters at minimum; FortiGate is stretch.
- **Encrypted traffic ratio is ~87%** — our detection works on metadata
  (flow features), not payloads. Don't write code that assumes payload access.
- **Argon2id memory cost** is calibrated for a server with ≥ 1 GB free RAM.
  If we run on a tiny dev box, the login API will appear to "hang" — it
  isn't, it's hashing. Don't lower the memory cost to "fix" this.
- **Australia is +10 / +11 hours UTC** depending on DST. Always store
  `timestamptz`, never naive timestamps.

## 9. Deliverables for NIT3003 vs NIT3004

| Asset | NIT3003 (this unit) | NIT3004 |
|---|---|---|
| Architecture, schema, OpenAPI | ✅ Final | (refinements only) |
| Web dashboard | ≥ 80% of MVP | Polish, accessibility, perf |
| Mobile app | ≥ 80% of MVP, biometric + push working | Store-ready build |
| Ingestion pipeline | All three protocols functional | Hardening, retries, DLQ |
| AI ensemble | Trained on CICIDS2017, evaluated | Live retraining, drift detection |
| LLM narrative | Working with fallback template | Cost optimisation |
| Cloud deployment | Staging on AWS | Production with monitoring |
| Tests | ≥ 70% / 60% coverage | Maintain |
| Documentation | Architecture, API, README | User manual, runbooks |

## 10. When you are unsure

The order of authority is:

1. The user's most recent instruction in this turn.
2. This file (`CLAUDE.md`).
3. `docs/openapi.yaml` for API shape; `docs/architecture.md` for system shape.
4. The proposal in the project knowledge base.
5. Industry default.

If 1 and 2 disagree, stop and ask. If 2 and 3 disagree, treat it as a bug
and surface it as a question rather than silently picking one.
