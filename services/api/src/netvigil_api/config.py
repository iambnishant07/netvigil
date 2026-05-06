from __future__ import annotations

import base64
import logging
import re
import textwrap

from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
    load_der_private_key,
    load_der_public_key,
    load_pem_private_key,
    load_pem_public_key,
)
from pydantic_settings import BaseSettings, SettingsConfigDict

_log = logging.getLogger(__name__)


class Settings(BaseSettings):
    # PostgreSQL — set DATABASE_URL for cloud DBs (Neon, etc.); individual
    # params are used as fallback for local docker-compose.
    database_url:      str = ""
    postgres_host:     str = "localhost"
    postgres_port:     int = 5432
    postgres_db:       str = "netvigil"
    postgres_user:     str = "netvigil"
    postgres_password: str = "devpassword"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Kafka — set KAFKA_SECURITY_PROTOCOL=SASL_SSL and SASL creds for Upstash
    kafka_bootstrap_servers:  str = "localhost:9092"
    kafka_security_protocol:  str = "PLAINTEXT"
    kafka_sasl_mechanism:     str = "PLAIN"
    kafka_sasl_username:      str = ""
    kafka_sasl_password:      str = ""

    # InfluxDB
    influxdb_url:    str = "http://localhost:8086"
    influxdb_token:  str = "dev-influx-token-change-in-prod"
    influxdb_org:    str = "netvigil"
    influxdb_bucket: str = "netflow"

    # JWT (RS256) — newlines stored as \n in env
    jwt_private_key:       str = ""
    jwt_public_key:        str = ""
    jwt_access_token_ttl:  int = 900      # 15 min
    jwt_refresh_token_ttl: int = 604_800  # 7 days

    # Google OAuth
    google_client_id:     str = ""
    google_client_secret: str = ""
    api_base_url:         str = "https://netvigil-api.up.railway.app"

    # Anthropic
    anthropic_api_key: str = ""

    # CORS — comma-separated list of allowed origins; "*" allows all (dev only)
    allowed_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def asyncpg_dsn(self) -> str:
        if self.database_url:
            # Neon / cloud: DATABASE_URL may use postgres:// scheme
            return self.database_url.replace("postgres://", "postgresql://", 1)
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    def private_key_pem(self) -> str:
        return self._normalise_pem(self.jwt_private_key)

    def public_key_pem(self) -> str:
        return self._normalise_pem(self.jwt_public_key)

    @staticmethod
    def _normalise_pem(key: str) -> str:
        # Phase 1: normalise escape sequences and line endings.
        key = key.replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "").strip()

        # Phase 2: reconstruct PEM framing when key is completely flat
        # (header+base64+footer with no newlines).
        if "\n" not in key:
            match = re.match(r"(-----BEGIN [^-]+-----)(.*?)(-----END [^-]+-----)", key)
            if match:
                header, b64, footer = match.groups()
                wrapped = "\n".join(textwrap.wrap(b64.strip(), 64))
                key = f"{header}\n{wrapped}\n{footer}"

        # Phase 3: load via cryptography and re-export to guarantee correct
        # framing and 64-char line wrapping (handles long single-line base64).
        key_bytes = key.encode()
        try:
            pk = load_pem_private_key(key_bytes, password=None)
            return pk.private_bytes(
                Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
            ).decode()
        except Exception:
            pass
        try:
            pub = load_pem_public_key(key_bytes)
            return pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
        except Exception:
            pass

        # Phase 4: key stored as raw base64-encoded DER (no PEM headers at all).
        try:
            der = base64.b64decode(key.replace("\n", "").replace(" ", ""))
            try:
                pk = load_der_private_key(der, password=None)
                return pk.private_bytes(
                    Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
                ).decode()
            except Exception:
                pass
            try:
                pub = load_der_public_key(der)
                return pub.public_bytes(
                    Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
                ).decode()
            except Exception:
                pass
        except Exception:
            pass

        _log.warning(
            "JWT key cannot be parsed in any known format — "
            "regenerate the key pair and update Railway env vars. "
            "First 120 chars: %r",
            key[:120],
        )
        return key


settings = Settings()
