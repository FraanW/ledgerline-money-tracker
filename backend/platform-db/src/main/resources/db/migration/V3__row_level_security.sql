-- =============================================================================
-- M5 — Migration 0003: Row-Level Security (the core deliverable)
-- =============================================================================
-- This is what makes Ledgerline a real multi-tenant correctness floor: the
-- database itself refuses to return another tenant's rows, regardless of what
-- the application query says.
--
-- HOW IT WORKS
-- -----------------------------------------------------------------------------
-- Each connection carries a tenant context in the GUC `app.current_tenant`,
-- set with `SET LOCAL app.current_tenant = '<uuid>'` inside a transaction (the
-- db-client's withTenant() helper does this). Every policy below filters by:
--
--     tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
--
-- The second arg `true` = "missing_ok": if the GUC was never set this session,
-- current_setting returns NULL. BUT a GUC that was SET LOCAL and then released
-- (e.g. a reset connection in the pool) can come back as the EMPTY STRING '',
-- and ''::uuid raises "invalid input syntax for type uuid". So we wrap it in
-- NULLIF(..., '') to coerce both the unset and empty cases to NULL.
-- NULL::uuid never equals any tenant_id, so an un-scoped connection sees ZERO
-- rows and can INSERT nothing — a safe fail-closed default.
--
-- ENABLE vs FORCE
-- -----------------------------------------------------------------------------
--   ENABLE ROW LEVEL SECURITY — turns policies on for normal roles.
--   FORCE  ROW LEVEL SECURITY — ALSO applies them to the table OWNER.
-- We FORCE on every tenant table so that even the migration/owner role (and any
-- accidental app-connects-as-owner) cannot bypass isolation. Superusers still
-- bypass RLS entirely — that is why the app must NOT connect as a superuser
-- (see migration 0001's role-model note).
--
-- WITH CHECK vs USING
-- -----------------------------------------------------------------------------
--   USING       — gates which existing rows are visible/updatable/deletable.
--   WITH CHECK  — gates which new/updated row values are allowed to be written.
-- We set both so a connection scoped to tenant A can neither read tenant B's
-- rows NOR write a row stamped with tenant B's id.
--
-- `tenants` itself is NOT under RLS: it is the control-plane table that DEFINES
-- tenants. Access to it is an admin concern handled outside the tenant-scoped
-- request path.
-- =============================================================================

-- Reusable predicate, inlined per table below for clarity:
--   tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid

-- ---------- accounts ----------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE  ROW LEVEL SECURITY;
CREATE POLICY accounts_tenant_isolation ON accounts
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- categories ----------
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE  ROW LEVEL SECURITY;
CREATE POLICY categories_tenant_isolation ON categories
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- transactions ----------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE  ROW LEVEL SECURITY;
CREATE POLICY transactions_tenant_isolation ON transactions
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- envelopes ----------
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelopes FORCE  ROW LEVEL SECURITY;
CREATE POLICY envelopes_tenant_isolation ON envelopes
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- ledger_transfers ----------
ALTER TABLE ledger_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transfers FORCE  ROW LEVEL SECURITY;
CREATE POLICY ledger_transfers_tenant_isolation ON ledger_transfers
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- ---------- ledger_entries ----------
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE  ROW LEVEL SECURITY;
CREATE POLICY ledger_entries_tenant_isolation ON ledger_entries
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
