"""IP geolocation with three-layer fallback.

Layer 1 — MaxMind GeoLite2 local database (fast, offline, industry-standard).
           Place GeoLite2-City.mmdb at the path in GEOIP_DB_PATH
           (download free from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data).

Layer 2 — ipinfo.io HTTPS API (async, ~1 ms extra latency).
           Set IPINFO_TOKEN for the free 50k-req/month tier; works without
           a token at lower rate limits.

Layer 3 — Hardcoded seed table covering IANA documentation ranges and
           common attacker prefixes used in synthetic seed data.

Results are cached in-process for the lifetime of the worker (no repeated
lookups for the same IP within a single deploy).
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import NamedTuple

import httpx

log = logging.getLogger(__name__)

# ─── configuration ────────────────────────────────────────────────────────────

_DB_PATH      = Path(os.getenv("GEOIP_DB_PATH", "data/GeoLite2-City.mmdb"))
_IPINFO_TOKEN = os.getenv("IPINFO_TOKEN", "")

# ─── types ────────────────────────────────────────────────────────────────────

class GeoResult(NamedTuple):
    lat:     float
    lng:     float
    country: str

# ─── RFC-1918 / private-IP detection ─────────────────────────────────────────

_RFC1918 = (
    "10.", "192.168.",
    "172.16.", "172.17.", "172.18.", "172.19.", "172.20.",
    "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
    "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
)


def is_private(ip: str) -> bool:
    return any(ip.startswith(p) for p in _RFC1918)


# ─── GeoLite2 reader (lazy, singleton) ───────────────────────────────────────

_geoip_tried  = False
_geoip_reader: object = None   # geoip2.database.Reader when loaded


def _get_reader() -> object | None:
    global _geoip_tried, _geoip_reader  # noqa: PLW0603
    if not _geoip_tried:
        _geoip_tried = True
        if not _DB_PATH.exists():
            log.info("GeoLite2 DB not found at %s — using fallback lookup", _DB_PATH)
            return None
        try:
            import geoip2.database
            _geoip_reader = geoip2.database.Reader(str(_DB_PATH))
            log.info("GeoLite2 database loaded from %s", _DB_PATH)
        except Exception as exc:
            log.warning("Failed to open GeoLite2 DB: %s", exc)
    return _geoip_reader or None


def _lookup_geoip2(ip: str) -> GeoResult | None:
    reader = _get_reader()
    if reader is None:
        return None
    try:
        import geoip2.errors
        resp = reader.city(ip)  # type: ignore[union-attr]
        lat = resp.location.latitude
        lng = resp.location.longitude
        if lat is None or lng is None:
            return None
        return GeoResult(
            lat=float(lat),
            lng=float(lng),
            country=resp.country.iso_code or "??",
        )
    except Exception:
        return None


# ─── Seed table — IANA doc ranges + common attacker blocks ───────────────────

_SEED: dict[str, GeoResult] = {
    "185.220": GeoResult( 50.1,   8.7,  "DE"),   # Tor exits, Frankfurt
    "185.156": GeoResult( 55.7,  37.6,  "RU"),
    "103.74":  GeoResult( 22.3, 114.2,  "HK"),
    "222.186": GeoResult( 30.6, 114.3,  "CN"),
    "101.33":  GeoResult( 39.9, 116.4,  "CN"),
    "125.124": GeoResult( 31.2, 121.5,  "CN"),
    "58.218":  GeoResult( 32.0, 118.8,  "CN"),
    "194.165": GeoResult( 50.1,  14.4,  "CZ"),
    "45.33":   GeoResult( 37.8,-122.4,  "US"),
    "104.21":  GeoResult( 37.4,-122.1,  "US"),
    "2.56":    GeoResult( 52.3,   4.9,  "NL"),
    "91.108":  GeoResult( 52.3,   4.9,  "NL"),
    "92.242":  GeoResult( 55.7,  37.6,  "RU"),   # Moscow
    "45.142":  GeoResult( 48.2,  16.4,  "AT"),
    "197.210": GeoResult(  9.1,   7.5,  "NG"),
    "1.179":   GeoResult(-33.9, 151.2,  "AU"),
    "203.206": GeoResult(-37.8, 145.0,  "AU"),
    "198.51":  GeoResult( 35.7, 139.7,  "JP"),   # IANA doc range
    "203.0":   GeoResult(  1.4, 103.8,  "SG"),   # IANA doc range
}


def _lookup_seed(ip: str) -> GeoResult | None:
    prefix = ".".join(ip.split(".")[:2])
    return _SEED.get(prefix)


# ─── In-process cache ─────────────────────────────────────────────────────────

# Maps IP string → GeoResult (hit) or None (known miss — don't retry)
_cache: dict[str, GeoResult | None] = {}


# ─── ipinfo.io HTTPS fallback (single shared client per batch) ────────────────

async def _fetch_ipinfo(client: httpx.AsyncClient, ip: str) -> GeoResult | None:
    """Query ipinfo.io for a single IP via HTTPS."""
    try:
        params = {"token": _IPINFO_TOKEN} if _IPINFO_TOKEN else {}
        resp = await client.get(f"https://ipinfo.io/{ip}/json", params=params)
        if resp.status_code != 200:
            return None
        data: dict[str, object] = resp.json()
        loc = data.get("loc")
        if not isinstance(loc, str) or "," not in loc:
            return None
        lat_str, lng_str = loc.split(",", 1)
        country = data.get("country")
        return GeoResult(
            lat=float(lat_str),
            lng=float(lng_str),
            country=str(country) if country else "??",
        )
    except Exception as exc:
        log.debug("ipinfo.io lookup failed for %s: %s", ip, exc)
        return None


# ─── public API ───────────────────────────────────────────────────────────────

def lookup_sync(ip: str) -> GeoResult | None:
    """Synchronous lookup: GeoLite2 → seed table → None (no HTTP)."""
    if is_private(ip):
        return None
    if ip in _cache:
        return _cache[ip]
    result = _lookup_geoip2(ip) or _lookup_seed(ip)
    _cache[ip] = result
    return result


async def batch_lookup(ips: list[str]) -> dict[str, GeoResult]:
    """Batch async lookup for a list of IPs.

    Deduplicates, filters private addresses, tries GeoLite2 + seed table
    synchronously first, then fetches remaining IPs from ipinfo.io in a
    single concurrent round-trip.
    """
    # Deduplicate preserving insertion order, skip private IPs
    unique = list(dict.fromkeys(ip for ip in ips if not is_private(ip)))

    results: dict[str, GeoResult] = {}
    need_http: list[str] = []

    for ip in unique:
        if ip in _cache:
            cached = _cache[ip]
            if cached is not None:
                results[ip] = cached
        else:
            r = _lookup_geoip2(ip) or _lookup_seed(ip)
            _cache[ip] = r
            if r is not None:
                results[ip] = r
            else:
                need_http.append(ip)

    if need_http:
        async with httpx.AsyncClient(timeout=5.0) as client:
            fetched = await asyncio.gather(
                *[_fetch_ipinfo(client, ip) for ip in need_http]
            )
        for ip, r in zip(need_http, fetched):
            _cache[ip] = r            # cache None too — don't retry same IP
            if r is not None:
                results[ip] = r

    return results


def country_for_sync(ip: str) -> str:
    """Return ISO country code for *ip*, or '??' if unknown."""
    result = lookup_sync(ip)
    return result.country if result else "??"
