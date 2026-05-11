"""Add user status (pending/active/rejected), super_admin for seed account

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-11
"""
from __future__ import annotations

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- User lifecycle status: pending = awaiting admin approval
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('pending', 'active', 'rejected'));

    -- Seed account is the global super-admin
    UPDATE users SET role = 'super_admin', status = 'active'
    WHERE email = 'iamb.nishant@gmail.com';

    -- organizations public name list (for register dropdown)
    -- No schema change needed — organizations table already has name column.
    """)


def downgrade() -> None:
    op.execute("""
    ALTER TABLE users DROP COLUMN IF EXISTS status;

    UPDATE users SET role = 'admin'
    WHERE email = 'iamb.nishant@gmail.com' AND role = 'super_admin';
    """)
