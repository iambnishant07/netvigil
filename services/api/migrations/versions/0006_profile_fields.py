"""Add optional profile fields to users table

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-11
"""
from __future__ import annotations

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS full_name TEXT,
      ADD COLUMN IF NOT EXISTS phone     TEXT,
      ADD COLUMN IF NOT EXISTS address   TEXT,
      ADD COLUMN IF NOT EXISTS dob       DATE;
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE users
      DROP COLUMN IF EXISTS full_name,
      DROP COLUMN IF EXISTS phone,
      DROP COLUMN IF EXISTS address,
      DROP COLUMN IF EXISTS dob;
    """)
