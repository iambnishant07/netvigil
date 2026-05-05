from __future__ import annotations

import logging
import re
import textwrap

from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
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
        # Phase 1: normalise escape sequences and line endings so we always
        # work with actual LF newlines from here on.
        key = key.replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "").strip()

        # Phase 2: reconstruct PEM framing when the key is completely flat
        # (header+base64+footer jammed together with no newlines at all).
        if "\n" not in key:
            match = re.match(r"(-----BEGIN [^-]+-----)(.*?)(-----END [^-]+-----)", key)
            if match:
                header, b64, footer = match.groups()
                wrapped = "\n".join(textwrap.wrap(b64.strip(), 64))
                key = f"{header}\n{wrapped}\n{footer}"

        # Phase 3: load with cryptography and re-export. This normalises any
        # remaining issues (e.g. base64 body on a single long line, wrong
        # line-wrap width, trailing spaces) and guarantees python-jose can
        # parse the result.
        key_bytes = key.encode()
        try:
            private_key = load_pem_private_key(key_bytes, password=None)
            return private_key.private_bytes(
                Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()
            ).decode()
        except Exception:
            pass
        try:
            public_key = load_pem_public_key(key_bytes)
            return public_key.public_bytes(
                Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
            ).decode()
        except Exception:
            pass

        _log.warning(
            "JWT PEM key cannot be parsed after normalisation — "
            "check Railway env vars. First 120 chars: %r",
            key[:120],
        )
        return key


settings = Settings()
