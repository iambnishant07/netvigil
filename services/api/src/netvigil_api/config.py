from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    kafka_sasl_mechanism:     str = "SCRAM-SHA-256"
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
        return self.jwt_private_key.replace("\\n", "\n")

    def public_key_pem(self) -> str:
        return self.jwt_public_key.replace("\\n", "\n")


settings = Settings()
