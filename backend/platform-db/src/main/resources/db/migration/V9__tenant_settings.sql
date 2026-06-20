-- =============================================================================
-- M12+ — Migration 0009: Tenant (household) settings
-- =============================================================================
-- Budget behaviours that belong to the WHOLE workspace, not one user: the
-- monthly-rollover toggle (carry unspent envelope money forward — see ADR-0005)
-- and the workspace's default currency. One row per tenant.
--
-- NOTE — "loan offers" is NOT a setting. The Settings UI shows it permanently
-- OFF with "We never show these. Ever." That is a product invariant, not a
-- toggle, so it is deliberately absent from the schema (nothing to store).
-- =============================================================================

CREATE TABLE tenant_settings (
  tenant_id                UUID          PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  monthly_rollover_enabled BOOLEAN       NOT NULL DEFAULT true,
  default_currency         currency_code NOT NULL DEFAULT 'INR',
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_settings TO ledgerline_app;
