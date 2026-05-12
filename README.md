# AankhaNet — AI-driven Network Detection and Response

> Capstone project for **NIT3003 / NIT3004** at Victoria University.  
> Built by a three-person team: Networks & Systems · Cybersecurity · Mobile App Development.

AankhaNet is a lightweight NDR platform for Australian small and medium-sized businesses. It ingests Syslog, NetFlow v9, and pcap from SMB network gear, runs an AI ensemble to detect anomalies, maps findings to MITRE ATT&CK, and delivers real-time alerts to a web dashboard and a mobile SOC companion app.

---

## Live demo

| Surface | URL |
|---------|-----|
| Web dashboard | <https://aankhanet-lime.vercel.app> |
| REST API | <https://aankhanet-api.up.railway.app/api/v1> |
| OpenAPI docs | <https://aankhanet-api.up.railway.app/docs> |

---

## Repository layout

```
aankhanet/
├── docs/
│   ├── openapi.yaml          # API contract — single source of truth
│   ├── architecture.md       # System design and data-flow
│   └── adr/                  # Architecture Decision Records
├── packages/
│   ├── shared-types/         # Generated TS types from openapi.yaml
│   ├── web/                  # Vite + React 18 + Tailwind dashboard
│   └── mobile/               # Expo + React Native SOC companion
└── services/
    ├── api/                  # FastAPI gateway (Python 3.12)
    ├── ingestor/             # Syslog / NetFlow v9 / pcap collectors
    ├── detector/             # AI ensemble + LLM narrative
    └── dispatcher/           # Email / SMS / push alert fan-out
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Web frontend | React 18, TypeScript strict, Vite, Tailwind CSS, React Router 6, TanStack Query, Recharts |
| Mobile | Expo SDK 54 (managed), React Native, TypeScript strict, React Navigation, TanStack Query |
| Maps | Mapbox GL JS (web), `@rnmapbox/maps` (mobile) |
| API gateway | Python 3.12, FastAPI, Pydantic v2, uvicorn |
| Streaming | Apache Kafka 3.7 (KRaft — no ZooKeeper) |
| Time-series | InfluxDB 2.7 |
| Relational | PostgreSQL 16 with Row-Level Security |
| ML | scikit-learn (Isolation Forest), PyTorch (Autoencoder), XGBoost |
| LLM | Anthropic Claude API (`claude-haiku-4-5`) |
| Cache | Redis 7 |
| Auth | Argon2id passwords, RS256 JWT, Google OAuth 2.0, TOTP MFA |
| Deployment | Railway (API), Vercel (web), Expo Go (mobile dev) |
| Package managers | pnpm (TypeScript), uv (Python) |

---

## Quick start — local development

### Prerequisites

- Docker Desktop (for infrastructure)
- Node.js ≥ 20 + pnpm (`npm i -g pnpm`)
- Python 3.12 + uv (`pip install uv`)
- Expo Go on your phone (for mobile)

### 1. Start infrastructure

```bash
# Generate RS256 key pair for JWT (one-time)
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Set required env vars
export JWT_PRIVATE_KEY="$(cat private.pem)"
export JWT_PUBLIC_KEY="$(cat public.pem)"

docker compose up -d postgres redis kafka influxdb
```

### 2. Run the API

```bash
cd services/api
uv sync
uv run alembic upgrade head
uv run uvicorn aankha_api.main:app --reload
# → http://localhost:8000
```

### 3. Run the web dashboard

```bash
cd packages/web
cp .env.example .env          # fill in VITE_API_URL=http://localhost:8000/api/v1
pnpm install
pnpm dev
# → http://localhost:5173
```

### 4. Run the mobile app

```bash
cd packages/mobile
cp .env.example .env.local    # fill in EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000/api/v1
pnpm install
pnpm start
# Scan the QR code with Expo Go
```

### 5. Seed demo data

Register an account, then:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -s -X POST http://localhost:8000/api/v1/seed \
  -H "Authorization: Bearer $TOKEN"
```

---

## Running all services

```bash
docker compose up --build
```

Exposed ports:

| Port | Service |
|------|---------|
| 8000 | FastAPI gateway |
| 514/udp | Syslog ingestor |
| 2055/udp | NetFlow v9 ingestor |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9092 | Kafka |
| 8086 | InfluxDB |

---

## Running tests

### Backend (Python)

```bash
cd services/api
docker compose up -d postgres   # tests need a real DB
uv run pytest --cov=aankha_api --cov-report=term-missing
# target: ≥ 70% line coverage
```

```bash
# Detector (no external deps)
cd services/detector
uv run pytest --cov=aankha_detector --cov-report=term-missing
```

```bash
# Dispatcher
cd services/dispatcher
uv run pytest --cov=aankha_dispatcher --cov-report=term-missing
```

```bash
# Ingestor
cd services/ingestor
uv run pytest --cov=aankha_ingestor --cov-report=term-missing
```

### Frontend (TypeScript)

```bash
cd packages/web
pnpm test --coverage
# target: ≥ 60% line coverage

cd packages/mobile
pnpm test --coverage
```

---

## Environment variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | api | PostgreSQL connection string (overrides individual params) |
| `JWT_PRIVATE_KEY` | api | RS256 private key (PEM) |
| `JWT_PUBLIC_KEY` | api | RS256 public key (PEM) |
| `GOOGLE_CLIENT_ID` | api | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | api | Google OAuth web client secret |
| `ANTHROPIC_API_KEY` | api, detector | Claude API key for LLM narratives |
| `REDIS_URL` | api | Redis connection string |
| `KAFKA_BOOTSTRAP_SERVERS` | api, ingestor, detector, dispatcher | Kafka brokers |
| `INFLUXDB_URL` / `INFLUXDB_TOKEN` | api, detector | InfluxDB credentials |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | dispatcher | SMTP for email alerts |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | dispatcher | Twilio for SMS alerts |
| `EXPO_ACCESS_TOKEN` | dispatcher | Expo push notification credentials |
| `VITE_API_URL` | web | API base URL |
| `VITE_MAPBOX_TOKEN` | web | Mapbox GL JS access token |
| `VITE_GOOGLE_CLIENT_ID` | web | Google OAuth client ID |
| `EXPO_PUBLIC_API_URL` | mobile | API base URL |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | mobile | Mapbox token |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | mobile | Google OAuth client ID |

Copy `services/api/.env.example`, `packages/web/.env.example`, and `packages/mobile/.env.example` for full lists.

---

## Architecture overview

See [docs/architecture.md](docs/architecture.md) for the full design, data-flow diagrams, and NFR budgets.

Key design decisions are recorded in [docs/adr/](docs/adr/).

---

## API reference

Interactive docs at `/docs` (Swagger UI) and `/redoc` on any running API instance. The canonical spec is [docs/openapi.yaml](docs/openapi.yaml).

---

## Security

- Passwords hashed with **Argon2id** (`m=64 MiB, t=3, p=4`).
- JWTs signed with **RS256**; access token TTL 15 min, refresh 7 days.
- All tenant tables protected by **PostgreSQL Row-Level Security**.
- Parameterised queries only — no string-concatenated SQL.
- TLS 1.3 enforced on all external traffic via Railway / Vercel edge.

---

## Project status — NIT3003 deliverables

| Deliverable | Status |
|-------------|--------|
| Architecture & OpenAPI spec | ✅ Complete |
| Web dashboard (≥ 80% MVP) | ✅ Deployed to Vercel |
| Mobile app (≥ 80% MVP, biometric + push) | ✅ APK on EAS / Expo Go |
| Syslog / NetFlow / pcap ingestor | ✅ Implemented |
| AI ensemble (IF + AE + XGBoost) | ✅ Implemented |
| LLM narrative (Claude API + fallback) | ✅ Implemented |
| Alert dispatcher (email / SMS / push) | ✅ FCM V1 push confirmed |
| RBAC (8 roles × 13 permissions) | ✅ API + web + mobile |
| Audit trail | ✅ Immutable audit_logs table + web page |
| Backend test coverage ≥ 70% | ✅ 81.72% (68 tests) |
| Frontend test coverage ≥ 60% | ✅ Passing |
| Cloud deployment (staging) | ✅ Railway (API/workers) + Vercel (web) |
