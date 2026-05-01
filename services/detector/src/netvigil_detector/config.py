from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url:      str = ""
    postgres_host:     str = "localhost"
    postgres_port:     int = 5432
    postgres_db:       str = "netvigil"
    postgres_user:     str = "netvigil"
    postgres_password: str = "devpassword"

    kafka_bootstrap_servers:  str = "localhost:9092"
    kafka_consumer_group:     str = "netvigil-detector"
    kafka_security_protocol:  str = "PLAINTEXT"
    kafka_sasl_mechanism:     str = "SCRAM-SHA-256"
    kafka_sasl_username:      str = ""
    kafka_sasl_password:      str = ""

    influxdb_url:    str = "http://localhost:8086"
    influxdb_token:  str = "dev-influx-token-change-in-prod"
    influxdb_org:    str = "netvigil"
    influxdb_bucket: str = "netflow"

    anthropic_api_key: str = ""

    model_dir: str = "models"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def asyncpg_dsn(self) -> str:
        if self.database_url:
            return self.database_url.replace("postgres://", "postgresql://", 1)
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
