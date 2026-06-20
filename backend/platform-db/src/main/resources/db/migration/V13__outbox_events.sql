-- =============================================================================
-- M4 — Migration 0013: Transactional outbox
-- =============================================================================
-- The transactional-outbox pattern (M4): producers write a domain event into
-- this table in the SAME transaction as the state change, and a separate CDC /
-- relay process drains unpublished rows to Redpanda. This gives at-least-once
-- publication without a distributed transaction.
--
-- RLS — ENABLE, not FORCE (deliberate)
-- -----------------------------------------------------------------------------
-- Producers INSERT under a tenant context, so the tenant policy isolates writes
-- by app.current_tenant. But the RELAY must read EVERY tenant's unpublished
-- rows to drain them — a cross-tenant scan. ENABLE-not-FORCE lets the relay run
-- as the owner/privileged role (which bypasses non-forced RLS) while the runtime
-- `ledgerline_app` role stays tenant-isolated. Same rationale as `users` (V7).
--
-- idx_outbox_unpublished is a PARTIAL index on the unpublished tail — the relay's
-- hot query ("oldest rows where published_at IS NULL") stays cheap as the table
-- grows, because published rows drop out of the index.
-- =============================================================================

CREATE TABLE outbox_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,                 -- e.g. 'transaction.ingested'
  event_version  INT         NOT NULL DEFAULT 1,
  aggregate_type TEXT,                                 -- e.g. 'transaction'
  aggregate_id   UUID,
  payload        JSONB       NOT NULL,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at   TIMESTAMPTZ                           -- NULL until the relay publishes
);
CREATE INDEX idx_outbox_tenant      ON outbox_events (tenant_id);
CREATE INDEX idx_outbox_unpublished ON outbox_events (occurred_at) WHERE published_at IS NULL;

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_isolation ON outbox_events
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Producers (app role) insert + read their own tenant's events. The relay reads
-- cross-tenant as the owner role (bypasses non-forced RLS) and stamps
-- published_at, so the app role does not need a cross-tenant grant.
GRANT SELECT, INSERT, UPDATE ON outbox_events TO ledgerline_app;
