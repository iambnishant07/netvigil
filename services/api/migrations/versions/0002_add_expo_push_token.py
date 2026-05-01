"""Add expo_push_token to users table

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-01
"""
from __future__ import annotations

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS expo_push_token;")
