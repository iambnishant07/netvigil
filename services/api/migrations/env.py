from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _db_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    if url:
        # Neon / cloud: normalise scheme for SQLAlchemy + psycopg2
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        url = url.replace("postgres://",   "postgresql+psycopg2://", 1)
        return url
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5432")
    db   = os.getenv("POSTGRES_DB",   "netvigil")
    user = os.getenv("POSTGRES_USER", "netvigil")
    pw   = os.getenv("POSTGRES_PASSWORD", "devpassword")
    return f"postgresql+psycopg2://{user}:{pw}@{host}:{port}/{db}"


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = _db_url()
    connectable = engine_from_config(cfg, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline() -> None:
    context.configure(
        url=_db_url(),
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
