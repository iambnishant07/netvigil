"""Expand roles to 8, add is_active, add audit_logs table

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-08
"""
from __future__ import annotations

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- Drop any existing role CHECK constraint on users
    DO $$
    DECLARE r RECORD;
    BEGIN
        FOR r IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'users'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%role%'
        LOOP
            EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
        END LOOP;
    END $$;

    -- Migrate legacy role names
    UPDATE users SET role = 'auditor' WHERE role = 'viewer';

    -- New 8-role constraint
    ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN (
            'super_admin', 'admin', 'senior_analyst', 'analyst',
            'threat_hunter', 'forensic_investigator', 'auditor', 'developer'
        ));

    -- is_active: deactivated users cannot log in or use the API
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

    -- Immutable audit trail
    CREATE TABLE IF NOT EXISTS audit_logs (
        id               UUID        PRIMARY KEY,
        organization_id  UUID        REFERENCES organizations(id) ON DELETE CASCADE,
        actor_id         UUID        NOT NULL REFERENCES users(id),
        action           TEXT        NOT NULL,
        target_id        TEXT,
        metadata         JSONB       NOT NULL DEFAULT '{}',
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS audit_logs_org_actor  ON audit_logs(organization_id, actor_id);
    CREATE INDEX IF NOT EXISTS audit_logs_created_at ON audit_logs(created_at DESC);

    ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY audit_logs_org_isolation ON audit_logs
        USING (organization_id =
               (nullif(current_setting('app.current_org', TRUE), ''))::uuid);
    """)


def downgrade() -> None:
    op.execute("""
    DROP TABLE IF EXISTS audit_logs;

    ALTER TABLE users DROP COLUMN IF EXISTS is_active;

    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

    UPDATE users SET role = 'analyst'
        WHERE role IN ('super_admin','senior_analyst','threat_hunter',
                       'forensic_investigator','developer');
    UPDATE users SET role = 'viewer' WHERE role = 'auditor';

    ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','analyst','viewer'));
    """)
