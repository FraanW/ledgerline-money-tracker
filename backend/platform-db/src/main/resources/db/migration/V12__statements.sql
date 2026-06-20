-- =============================================================================
-- M1 — Migration 0012: Statement uploads (ingestion batches)
-- =============================================================================
-- M1 ingestion currently returns a StatementUploadResult (statementId, fileName,
-- accepted, duplicates, errors[]) but nothing persists it. This table is that
-- batch record, so the Log / Transactions surfaces can show ingestion status
-- and history, and each imported transaction can point back at its batch.
--
--   statements                       — one row per upload/sync batch.
--   transactions.statement_id (added)— the batch a transaction came from.
--
-- errors is JSONB ([{line, message}]) — a small, read-mostly blob, not worth a
-- child table at v0. Standard tenant-scoped (FORCE RLS + app.current_tenant).
-- =============================================================================

CREATE TYPE statement_status AS ENUM ('processing', 'completed', 'failed');

CREATE TABLE statements (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID             NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  file_name       TEXT             NOT NULL,
  source          ingestion_source NOT NULL DEFAULT 'statement_upload',
  accepted_count  INT              NOT NULL DEFAULT 0,
  duplicate_count INT              NOT NULL DEFAULT 0,
  error_count     INT              NOT NULL DEFAULT 0,
  errors          JSONB,                                  -- [{line, message}]
  status          statement_status NOT NULL DEFAULT 'processing',
  uploaded_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT statements_counts_nonneg
    CHECK (accepted_count >= 0 AND duplicate_count >= 0 AND error_count >= 0)
);
CREATE INDEX idx_statements_tenant ON statements (tenant_id);

-- Link transactions to the batch that imported them (additive, default NULL).
ALTER TABLE transactions
  ADD COLUMN statement_id UUID NULL REFERENCES statements(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_statement ON transactions (statement_id);

ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements FORCE  ROW LEVEL SECURITY;
CREATE POLICY statements_tenant_isolation ON statements
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON statements TO ledgerline_app;
