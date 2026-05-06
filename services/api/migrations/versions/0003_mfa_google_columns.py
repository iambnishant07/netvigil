"""Add mfa_secret and google_sub to users

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-06
"""
from __future__ import annotations

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret  TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub  TEXT UNIQUE;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
    ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
    """)
