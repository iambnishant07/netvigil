# ADR-0006 — MaxMind GeoLite2 with ipinfo.io HTTPS fallback for IP geolocation

**Date:** 2026-05  
**Status:** Accepted

## Context

The Mapbox GL JS threat map and the KPI "top external destinations" tile both
require (lat, lng, country) for public IP addresses. We evaluated three options:

| Option | Latency | Offline capable | Cost | Privacy |
|--------|---------|-----------------|------|---------|
| MaxMind GeoLite2 (MMDB) | ~1 ms | Yes | Free (registration) | No external call |
| ipinfo.io HTTPS API | ~200 ms | No | Free tier 50k req/mo | IP sent to ipinfo |
| ip-api.com | ~200 ms | No | Free (non-commercial) | IP sent to external |

GeoLite2 is the clear winner when the MMDB file is present. It resolves in
under 1 ms with no external network calls, supporting NFR-05 (dashboard GET p95
≤ 250 ms). However, the MMDB file is 60 MB and cannot be committed to the
repository (binary, changes monthly, requires MaxMind account).

We need a fallback for development environments where the MMDB is not present
and for the initial deployment before the file is provisioned.

## Decision

Implement a two-tier lookup in `services/api/src/aankhanet_api/geo.py`:

1. If `data/GeoLite2-City.mmdb` exists, load `geoip2.database.Reader` once at
   startup and serve all lookups from it. Source tag: `geoip2`.
2. If the MMDB is absent, fall back to `GET https://ipinfo.io/{ip}/json` over
   HTTPS via `httpx`. Results are cached in-process. Source tag: `ipinfo`.

Private/RFC-1918 addresses short-circuit to `source: private` before either
lookup is attempted.

The `GEOIP_DB_PATH` environment variable overrides the default `data/GeoLite2-City.mmdb`
path. The optional `IPINFO_TOKEN` variable is appended to ipinfo.io requests
for higher rate limits (50k → 250k requests/month on the free plan).

## Consequences

- The `.mmdb` file is added to `.gitignore`. Deployment documentation must
  include instructions for provisioning the file (download from MaxMind, place
  in the container's `data/` volume).
- In development without the MMDB, geolocation works but adds ~200 ms latency
  per unique IP (cached after first call). This degrades the threat-map load
  time but does not break functionality.
- The `batch_lookup(ips)` helper resolves a list of IPs concurrently using
  `asyncio.gather`, minimising wall-clock time for the threat-map endpoint
  which may need to geolocate up to 200 IPs per request.
- ipinfo.io's free tier sends IP addresses to a third-party service. For
  production, the MMDB file should always be present to avoid this.
