"""Add mfa_secret, google_sub, expo_push_token to users

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-06
"""
from __future__ import annotations

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret       TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub       TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token  TEXT;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
    ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
    ALTER TABLE users DROP COLUMN IF EXISTS expo_push_token;
    """)
