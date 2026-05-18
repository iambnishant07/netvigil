# AankhaNet — Architecture

> MITRE ATT&CK version pinned to **v14**. Do not auto-update technique IDs.

---

## 1. System overview

```
                        ┌──────────────────────────────────────────┐
  SMB network gear      │              AankhaNet Platform             │
  ─────────────────     │                                            │
  pfSense / MikroTik    │  ┌──────────┐   Kafka    ┌────────────┐  │
  FortiGate / generic ──┼─►│ Ingestor │──────────►│  Detector  │  │
                        │  │ (UDP)    │  raw.*     │  AI + LLM  │  │
  Syslog  UDP:514       │  └──────────┘            └─────┬──────┘  │
  NetFlow UDP:2055      │                                 │         │
  pcap    (offline)     │                         incidents.*       │
                        │                                 │         │
                        │  ┌──────────┐            ┌─────▼──────┐  │
  Analysts              │  │   API    │◄───────────│ Dispatcher │  │
  ─────────             │  │ FastAPI  │  Postgres   │ email/SMS/ │  │
  Web browser ◄─────────┼──│          │             │ push       │  │
  Mobile app  ◄─────────┼──│          │             └────────────┘  │
                        │  └──────────┘                             │
                        │       │  │                                 │
                        │  Postgres  Redis                          │
                        └──────────────────────────────────────────┘
```

---

## 2. Services

### 2.1 Ingestor (`services/ingestor`)

Stateless UDP listeners. One asyncio process hosts all three collectors:

| Collector | Protocol | Port | Kafka topic |
|-----------|----------|------|-------------|
| Syslog | UDP | 514 | `raw.syslog` |
| NetFlow v9 | UDP | 2055 | `raw.netflow` |
| pcap | offline file | — | `raw.netflow` (re-uses flow schema) |

Each collector normalises vendor-specific fields into a common flow record dict before publishing. NetFlow v9 template caching is per-source-IP.

### 2.2 Detector (`services/detector`)

Kafka consumer on `raw.netflow` and `raw.syslog`. For each record:

1. **Feature extraction** — converts flow dict to 12-element float32 vector (duration, bytes, packets, rates, protocol, ports, TCP flags). Aligned with CICIDS2017 schema (Engelen et al. 2021 cleaned version).

2. **AI ensemble** (weighted average):
   - **Isolation Forest** (weight 0.6) — unsupervised anomaly score
   - **Autoencoder** (weight 0.4) — reconstruction error normalised to [0, 1]
   - **XGBoost classifier** — multi-class label from 7 attack categories

3. **MITRE mapping** — `mitre.py` maps the XGBoost label to an ATT&CK v14 technique ID and a severity floor. Final severity is `max(score_bucket, floor)`.

4. **LLM narrative** — async call to `claude-haiku-4-5` via the Anthropic Python SDK. Falls back to a deterministic template if the API key is absent or the call fails within the timeout.

5. **Writer** — inserts the incident row into PostgreSQL and publishes an `incidents.created` event to Kafka for the dispatcher.

Attack labels and their MITRE mappings:

| Label | Technique | Severity floor |
|-------|-----------|----------------|
| `port_scan` | T1046 | low |
| `ddos` | T1498 | medium |
| `brute_force` | T1110 | medium |
| `c2_beaconing` | T1071 | critical |
| `data_exfil` | T1048 | high |
| `lateral_movement` | T1021 | high |
| `unknown_anomaly` | T1059 | info |

### 2.3 API gateway (`services/api`)

FastAPI application. Thin routes → service layer → repository layer. All SQL is parameterised asyncpg.

Key routers:

| Router | Prefix | Responsibility |
|--------|--------|----------------|
| auth | `/auth` | Register (with profile), login, refresh, MFA, Google OAuth, push token |
| incidents | `/incidents` | CRUD, status/severity/narrative update, WebSocket stream |
| devices | `/devices` | CRUD for registered network devices |
| alert_rules | `/alert-rules` | CRUD — org-scoped, isolated per organisation |
| dashboard | `/dashboard` | KPIs, threat-map arcs, 7-day trend, attack-type breakdown |
| geo | `/geo` | Single-IP geolocation (GeoLite2 + ipinfo.io fallback) |
| audit_log | `/audit-log` | Immutable read-only audit trail |
| users | `/users` | Organisation user management (admin operations) |
| admin | `/admin` | Super-admin: cross-org user and org management |
| seed | `/seed` | Demo data insert / clear (idempotent) |

**Row-Level Security**: every tenant table has `organization_id UUID NOT NULL` and an RLS policy `USING (organization_id = current_setting('app.current_org')::uuid)`. The `get_connection(org_id)` helper wraps each request in an explicit transaction so that `set_config('app.current_org', org_id, TRUE)` (which is transaction-local) persists for all subsequent statements on that connection.

**Super-admin cross-org access**: a `super_admin` may supply the `X-Org-Id` request header to operate on any organisation. The `EffectiveOrg` FastAPI dependency resolves this header for super_admin and falls back to the JWT `org` claim for all other roles. Non-super_admin requests with an `X-Org-Id` header have the header silently ignored.

**WebSocket incident stream** (`/incidents/stream`): pushes `incident.created` events to connected clients in real time. Used by the web dashboard and mobile app for live updates.

### 2.4 Dispatcher (`services/dispatcher`)

Kafka consumer on `incidents.created`. For each event:

1. Loads all enabled alert rules for the org from PostgreSQL.
2. Evaluates rules with `evaluator.matching_rules()` — severity threshold + optional MITRE filter.
3. Fans out to matched channels: **email** (aiosmtplib), **SMS** (Twilio REST), **push** (Expo push API).

### 2.5 IP Geolocation

Source IPs and destination IPs on incidents are geolocated to (lat, lng, country, city)
for the Mapbox GL JS threat map and the KPI top-destinations tile.

Resolution order:
1. MaxMind GeoLite2-City database (`data/GeoLite2-City.mmdb`) — synchronous lookup,
   zero network calls, ~1 ms per IP.
2. ipinfo.io HTTPS JSON API — async fallback when the .mmdb file is absent.
   Response is cached in memory for the process lifetime.

Private/RFC-1918 addresses are classified as `source: "private"` and excluded from
the threat map arcs.

The `GET /geo/{ip}` API endpoint exposes single-IP lookup to the web client; it is
used by the live-feed click-to-geolocate feature on the dashboard.

### 2.6 Web dashboard (`packages/web`)

React 18 SPA built with Vite + Tailwind CSS. Key features:

- Mapbox GL JS interactive globe (replaced canvas threat map): attack arcs rendered
  as animated lines between source country and target device coordinates.
- Live incident feed via WebSocket (`/incidents/stream`) with PostgreSQL LISTEN/NOTIFY;
  falls back to 30-second polling.
- Click on a source IP in the live feed to open a geo-location card.
- KPI tiles: open incidents by severity, top internal talkers, top external destinations.
- 7-day severity trend chart (Recharts stacked bar).
- Attack type distribution donut chart.
- Incident list with severity/status/device filters, pagination, and detail modal.
- Device management CRUD.
- Alert rules CRUD — isolated per organisation.
- Team management and admin pages (approve/reject pending users).
- Audit log reader (auditor role and above).
- Organisation switcher in the header: super_admin can select any org from a dropdown;
  all subsequent API calls include `X-Org-Id` for the selected org.
- Registration page: collects `full_name`, `phone`, `dob` at signup (all required).

---

## 3. Data model (key tables)

```sql
organizations  (id, name, timezone, created_at)
users          (id, organization_id, email, password_hash, role,
                full_name, phone, address, dob,
                is_active, status,           -- status: pending | active | rejected
                mfa_enrolled, mfa_secret, google_sub,
                expo_push_token, created_at)
refresh_tokens (id, user_id, token_hash, expires_at, created_at)
devices        (id, organization_id, name, vendor, protocol,
                public_ip, location_lat, location_lng,
                shared_secret_hash, last_seen_at, created_at)
incidents      (id, organization_id, device_id, detected_at,
                severity, status, attack_label, mitre_technique,
                source_ip, destination_ip, anomaly_score,
                narrative, top_features jsonb, created_at)
alert_rules    (id, organization_id, name, min_severity, channel,
                mitre_filter text[], target_user_id, enabled, created_at)
audit_logs     (id, organization_id, user_id, action, detail jsonb, created_at)
```

All timestamps are `timestamptz`. All IDs are UUIDv7 (time-ordered, generated in application layer).

---

## 4. Authentication

```
┌──────┐  POST /auth/register ──────────────────► creates org + admin user
│      │  POST /auth/login    ──────────────────► returns access + refresh tokens
│Client│  POST /auth/refresh  ──────────────────► rotates refresh token
│      │  GET  /auth/google/mobile ──────────────► redirects to Google OAuth
│      │  GET  /auth/google/mobile-callback ─────► exchanges code, redirects to app
└──────┘

JWT claims: { sub: user_id, org: org_id, role, jti, iat, exp }
Signed with RS256. Access TTL: 15 min. Refresh TTL: 7 days (rotated on use).

MFA: TOTP (RFC 6238), 30-second window. Login returns mfa_required=true
     when enrolled; client must POST /auth/mfa/challenge with a valid code.

Google OAuth (web): GIS button POSTs id_token to POST /auth/google.
Google OAuth (mobile): API-proxied flow — app opens browser to
     GET /auth/google/mobile, API handles code exchange, redirects
     back to aankhanet:// deep link with JWT tokens in query params.
```

---

## 5. AI model notes

Models are trained on the **CICIDS2017 dataset, Engelen et al. (2021) cleaned version**. Raw CICIDS2017 accuracy numbers must not be cited without referencing the known label issues documented in that paper.

On first start without pre-trained model files, the detector trains on 500-row synthetic Gaussian data as a baseline. Production models are loaded from `settings.model_dir`.

Ensemble scoring:
```
anomaly_score = 0.6 × isolation_forest_score + 0.4 × autoencoder_score
```
Both components are clipped to [0, 1] before combining. XGBoost provides the attack label; it does not contribute to the numeric score.

Encrypted traffic note: ~87% of modern traffic is TLS-encrypted. All detection operates on **flow metadata** (duration, byte counts, packet rates, flags). No payload inspection is performed or assumed.

Training (CICIDS2017):
- 8 CSV files (14.8 GB raw), UTF-8 encoded. The Engelen et al. (2021) cleaned version
  is used; raw label strings contain U+FFFD (replacement character) as a separator
  where an en-dash is expected — label normalization is applied before the map lookup.
- Subsample for training: 100 000 benign flows + 80 000 attack flows (stratified).
- Isolation Forest: n_estimators=200, contamination=0.05. Fit on benign traffic only.
- Autoencoder: 12→8→4→8→12 architecture, 30 epochs, Adam lr=1e-3, batch 512.
  Reconstruction MSE on benign traffic sets the normalisation baseline.
- XGBoost classifier: n_estimators=300, max_depth=6, lr=0.1, subsample=0.8.
  The CICIDS2017 dataset has no lateral_movement samples, so class indices are
  non-contiguous; the model is saved as a bundle `{"clf": clf, "class_names": [...]}`
  with only the present classes, and the ensemble maps predictions back to label names
  via `class_names` rather than a fixed integer map.
- Models are serialised to `services/detector/models/`:
    - `scaler.pkl`          — StandardScaler fit on benign traffic features
    - `isolation_forest.pkl`
    - `autoencoder.pt`
    - `xgboost.pkl`         — dict bundle `{"clf", "class_names"}`

---

## 6. NFR budgets

| ID | Requirement | Implementation note |
|----|-------------|---------------------|
| NFR-04 | Packet → mobile push p95 ≤ 5 s | Kafka in-memory, async dispatcher, Expo push |
| NFR-05 | Dashboard API GET p95 ≤ 250 ms at 1 M incidents | Indexed `detected_at`, `organization_id`; KPI query uses pre-aggregation |
| NFR-07 | ≥ 99.5% monthly uptime | Railway auto-restart + Vercel edge CDN |
| NFR-08 | ≥ 5,000 events/sec ingestion | Async UDP receive + Kafka producer batching |

---

## 7. Deployment topology (staging)

```
Internet
   │
   ├── Vercel Edge (web dashboard — React SPA)
   │       └── HTTPS → Railway API
   │
   └── Railway (private network)
           ├── api         (FastAPI, port 8000)
           ├── PostgreSQL  (Railway managed)
           ├── Redis       (Railway managed)
           └── [ingestor / detector / dispatcher — local docker-compose for dev]
```

Production target (NIT3004): AWS ECS Fargate, RDS PostgreSQL, ElastiCache Redis, MSK Kafka, S3 model storage.
