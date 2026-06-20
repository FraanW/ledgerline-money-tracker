-- =============================================================================
-- M10+ — Migration 0008: Per-user settings + financial profile
-- =============================================================================
-- Two new per-user tables surfaced by the app's Settings page and the lens /
-- calculator engines (Runway, Make Room, Accumulator):
--
--   user_settings      — UI + notification preferences that follow the USER
--                         across every tenant (persona/theme, locale, nudges).
--                         Keyed on user_id; NOT tenant-scoped. RLS = self-only.
--   financial_profiles — each member's own income figures, WITHIN a tenant
--                         (powers per-person runway/savings-rate lenses). Keyed
--                         on (tenant_id, user_id); standard tenant RLS.
--
-- The persona ("genz" | "millennial" | "senior") becomes a first-class enum so
-- the DB rejects bad values — it currently lives only in client React state and
-- resets on reload. `preferred_theme` is where it persists.
--
-- Money stays integer paise (`*_minor` BIGINT), per the golden rule (V2). The
-- app's mock shapes use whole rupees; the API maps rupees <-> paise.
-- =============================================================================

CREATE TYPE persona_theme AS ENUM ('genz', 'millennial', 'senior');


-- ---------- user_settings — per-user, follows the user (self-only RLS) ----------
CREATE TABLE user_settings (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_theme         persona_theme NOT NULL DEFAULT 'millennial',
  locale                  TEXT          NOT NULL DEFAULT 'en-IN',
  log_reminders_enabled   BOOLEAN       NOT NULL DEFAULT true,
  spending_alerts_enabled BOOLEAN       NOT NULL DEFAULT true,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Self-only: a connection sees/edits exactly its own settings row. ENABLE (not
-- FORCE) so the owner/control-plane role can provision a default row on signup.
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_settings_self ON user_settings
  USING      (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);


-- ---------- financial_profiles — per-user, per-tenant (standard tenant RLS) ----------
CREATE TABLE financial_profiles (
  tenant_id                  UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                    UUID          NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  date_of_birth              DATE,
  monthly_take_home_minor    BIGINT,
  annual_pretax_income_minor BIGINT,
  currency                   currency_code NOT NULL DEFAULT 'INR',
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT financial_profiles_take_home_nonneg
    CHECK (monthly_take_home_minor IS NULL OR monthly_take_home_minor >= 0),
  CONSTRAINT financial_profiles_income_nonneg
    CHECK (annual_pretax_income_minor IS NULL OR annual_pretax_income_minor >= 0)
);
CREATE INDEX idx_financial_profiles_tenant ON financial_profiles (tenant_id);

ALTER TABLE financial_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_profiles FORCE  ROW LEVEL SECURITY;
CREATE POLICY financial_profiles_tenant_isolation ON financial_profiles
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ---------- grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings      TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_profiles TO ledgerline_app;
