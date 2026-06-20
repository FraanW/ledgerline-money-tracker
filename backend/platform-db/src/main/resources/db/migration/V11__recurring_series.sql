-- =============================================================================
-- M7 — Migration 0011: Recurring-charge series
-- =============================================================================
-- M7 (recurring/anomaly detection — see ADR-0010, prototyped in the Python
-- canonicalizer) needs a home for the SERIES it detects: a merchant that bills
-- on a cadence (Netflix monthly, insurance yearly), incl. free-trial-to-paid.
--
--   recurring_series          — one row per detected/confirmed series.
--   transactions.recurring_series_id (added here) — tags member transactions to
--                               their series, so the UI can show "part of a
--                               subscription" and the detector can backfill.
--
-- Standard tenant-scoped (FORCE RLS + app.current_tenant).
-- =============================================================================

CREATE TYPE recurring_cadence AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly', 'irregular');
CREATE TYPE recurring_status  AS ENUM ('active', 'trial', 'paused', 'lapsed');

CREATE TABLE recurring_series (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  merchant              TEXT              NOT NULL,
  category_id           UUID REFERENCES categories(id) ON DELETE SET NULL,
  cadence               recurring_cadence NOT NULL,
  expected_amount_minor BIGINT            NOT NULL,
  currency              currency_code     NOT NULL DEFAULT 'INR',
  last_seen_at          DATE,
  next_due_at           DATE,
  status                recurring_status  NOT NULL DEFAULT 'active',
  detected_at           TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT now(),
  CONSTRAINT recurring_series_expected_nonneg CHECK (expected_amount_minor >= 0)
);
CREATE INDEX idx_recurring_series_tenant ON recurring_series (tenant_id);

-- Tag transactions to the series they belong to (additive, default NULL).
ALTER TABLE transactions
  ADD COLUMN recurring_series_id UUID NULL REFERENCES recurring_series(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_recurring_series ON transactions (recurring_series_id);

ALTER TABLE recurring_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_series FORCE  ROW LEVEL SECURITY;
CREATE POLICY recurring_series_tenant_isolation ON recurring_series
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_series TO ledgerline_app;
