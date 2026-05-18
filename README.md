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
| `GEOIP_DB_PATH` | api | Path to GeoLite2-City.mmdb (optional, falls back to ipinfo.io if absent) |
| `IPINFO_TOKEN` | api | ipinfo.io API token (optional, for higher rate limits on the HTTPS fallback) |

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

## Key implemented features

### Super-admin cross-org access
A `super_admin` account may operate on any organisation by supplying the
`X-Org-Id: <org-uuid>` header. The web dashboard provides an organisation
switcher dropdown in the header that automatically injects this header.

### IP Geolocation
Source IPs are resolved to `(lat, lng, country, city)` using the MaxMind
GeoLite2-City database (MMDB) with an ipinfo.io HTTPS API fallback. Place the
database at `data/GeoLite2-City.mmdb` for offline-first resolution. The threat
map and the click-to-geolocate feature in the live incident feed both rely on this.

### Registration profile fields
Signup requires `fullName`, `phone`, and `dob` in addition to email and password.
Fields are validated server-side (Pydantic) and client-side (Zod): full name ≥ 2
chars, phone pattern `[\d\s+\-().]`, DOB must be a valid ISO date for a person
aged 16–120.

### Alert rule org isolation
Alert rule PATCH and DELETE operations include an `AND organization_id = $N` guard
at the SQL level, preventing a rule change in one org from affecting another.

---

## Project status — NIT3003 deliverables

| Deliverable | Status |
|-------------|--------|
| Architecture & OpenAPI spec | ✅ Complete, updated 2026-05 |
| Web dashboard (≥ 80% MVP) | ✅ Deployed to Vercel |
| Mobile app (≥ 80% MVP, biometric + push) | ✅ APK on EAS / Expo Go |
| Syslog / NetFlow / pcap ingestor | ✅ Implemented |
| AI ensemble (IF + AE + XGBoost, CICIDS2017) | ✅ Trained on 180k samples |
| LLM narrative (Claude API + fallback) | ✅ claude-haiku-4-5, template fallback |
| Alert dispatcher (email / SMS / push) | ✅ Expo push confirmed |
| RBAC (8 roles × 13 permissions) | ✅ API + web + mobile |
| Audit trail | ✅ Immutable audit_logs table + web page |
| Super-admin cross-org access | ✅ X-Org-Id header + EffectiveOrg dep |
| IP geolocation (GeoLite2 + ipinfo.io) | ✅ Threat map + click-to-geolocate |
| Mapbox GL JS threat map | ✅ Animated arc globe |
| Profile fields at signup | ✅ full_name, phone, dob required |
| Alert rule org isolation | ✅ Org-scoped UPDATE/DELETE |
| RLS transaction fix | ✅ asyncpg get_connection wraps transaction |
| Backend test coverage ≥ 70% | ✅ API ≥ 70%, Detector 80% |
| Frontend test coverage ≥ 60% | ✅ Passing |
| Cloud deployment (staging) | ✅ Railway (API) + Vercel (web) |
