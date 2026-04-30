from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    postgres_host:     str = "localhost"
    postgres_port:     int = 5432
    postgres_db:       str = "netvigil"
    postgres_user:     str = "netvigil"
    postgres_password: str = "devpassword"

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_consumer_group:    str = "netvigil-dispatcher"

    smtp_host:        str = "localhost"
    smtp_port:        int = 587
    smtp_user:        str = ""
    smtp_password:    str = ""
    alert_from_email: str = "alerts@netvigil.local"

    twilio_account_sid:  str = ""
    twilio_auth_token:   str = ""
    twilio_from_number:  str = ""

    expo_access_token: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def asyncpg_dsn(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
