"""Initial schema: organizations, users, devices, incidents, alert_rules

Revision ID: 0001
Revises:
Create Date: 2026-04-30
"""
from __future__ import annotations

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    -- ── organizations ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS organizations (
        id          UUID         PRIMARY KEY,
        name        TEXT         NOT NULL,
        timezone    TEXT         NOT NULL DEFAULT 'Australia/Brisbane',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── users ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
        id              UUID         PRIMARY KEY,
        organization_id UUID         NOT NULL
                            REFERENCES organizations(id) ON DELETE CASCADE,
        email           TEXT         NOT NULL UNIQUE,
        password_hash   TEXT         NOT NULL,
        role            TEXT         NOT NULL DEFAULT 'analyst'
                            CHECK (role IN ('admin','analyst','viewer')),
        mfa_enrolled    BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── refresh_tokens ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          UUID         PRIMARY KEY,
        user_id     UUID         NOT NULL
                        REFERENCES users(id) ON DELETE CASCADE,
        token_hash  TEXT         NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ  NOT NULL,
        revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── devices ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS devices (
        id                  UUID         PRIMARY KEY,
        organization_id     UUID         NOT NULL
                                REFERENCES organizations(id) ON DELETE CASCADE,
        name                TEXT         NOT NULL,
        vendor              TEXT         NOT NULL,
        protocol            TEXT         NOT NULL,
        public_ip           INET         NOT NULL,
        location_lat        DOUBLE PRECISION,
        location_lng        DOUBLE PRECISION,
        shared_secret_hash  TEXT         NOT NULL,
        last_seen_at        TIMESTAMPTZ,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── incidents ───────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS incidents (
        id               UUID         PRIMARY KEY,
        organization_id  UUID         NOT NULL
                             REFERENCES organizations(id) ON DELETE CASCADE,
        device_id        UUID         NOT NULL
                             REFERENCES devices(id),
        detected_at      TIMESTAMPTZ  NOT NULL,
        severity         TEXT         NOT NULL
                             CHECK (severity IN ('info','low','medium','high','critical')),
        status           TEXT         NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','acknowledged','confirmed','false_positive')),
        attack_label     TEXT         NOT NULL,
        mitre_technique  TEXT         NOT NULL,
        source_ip        TEXT         NOT NULL,
        destination_ip   TEXT         NOT NULL,
        anomaly_score    REAL         NOT NULL
                             CHECK (anomaly_score BETWEEN 0 AND 1),
        narrative        TEXT,
        top_features     JSONB        NOT NULL DEFAULT '[]',
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── alert_rules ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS alert_rules (
        id               UUID         PRIMARY KEY,
        organization_id  UUID         NOT NULL
                             REFERENCES organizations(id) ON DELETE CASCADE,
        name             TEXT         NOT NULL,
        min_severity     TEXT         NOT NULL
                             CHECK (min_severity IN ('info','low','medium','high','critical')),
        mitre_filter     TEXT[]       NOT NULL DEFAULT '{}',
        channel          TEXT         NOT NULL
                             CHECK (channel IN ('email','sms','push')),
        target_user_id   UUID         REFERENCES users(id),
        enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    -- ── Row-level security (tenant tables) ───────────────────────────────────
    ALTER TABLE devices     ENABLE ROW LEVEL SECURITY;
    ALTER TABLE incidents   ENABLE ROW LEVEL SECURITY;
    ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

    CREATE POLICY devices_org_isolation ON devices
        USING (organization_id =
               (nullif(current_setting('app.current_org', TRUE), ''))::uuid);

    CREATE POLICY incidents_org_isolation ON incidents
        USING (organization_id =
               (nullif(current_setting('app.current_org', TRUE), ''))::uuid);

    CREATE POLICY alert_rules_org_isolation ON alert_rules
        USING (organization_id =
               (nullif(current_setting('app.current_org', TRUE), ''))::uuid);

    -- ── Indexes ──────────────────────────────────────────────────────────────
    CREATE INDEX incidents_org_status    ON incidents(organization_id, status);
    CREATE INDEX incidents_detected_at   ON incidents(detected_at DESC);
    CREATE INDEX incidents_org_severity  ON incidents(organization_id, severity);
    CREATE INDEX devices_org             ON devices(organization_id);
    CREATE INDEX alert_rules_org_enabled ON alert_rules(organization_id, enabled);
    CREATE INDEX refresh_tokens_hash     ON refresh_tokens(token_hash);

    -- ── Postgres NOTIFY trigger for incident WebSocket feed ──────────────────
    CREATE OR REPLACE FUNCTION notify_incident_change()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
        PERFORM pg_notify(
            'incidents_changed',
            json_build_object(
                'type',     TG_OP,
                'id',       NEW.id,
                'org_id',   NEW.organization_id,
                'severity', NEW.severity,
                'status',   NEW.status
            )::text
        );
        RETURN NEW;
    END;
    $$;

    CREATE TRIGGER incident_notify
        AFTER INSERT OR UPDATE ON incidents
        FOR EACH ROW EXECUTE FUNCTION notify_incident_change();
    """)


def downgrade() -> None:
    op.execute("""
    DROP TRIGGER IF EXISTS incident_notify ON incidents;
    DROP FUNCTION IF EXISTS notify_incident_change();
    DROP TABLE IF EXISTS alert_rules;
    DROP TABLE IF EXISTS incidents;
    DROP TABLE IF EXISTS devices;
    DROP TABLE IF EXISTS refresh_tokens;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS organizations;
    """)
