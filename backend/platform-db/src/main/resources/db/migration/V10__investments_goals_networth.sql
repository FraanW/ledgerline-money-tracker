-- =============================================================================
-- M10+ — Migration 0010: Investments, goals, and net-worth items
-- =============================================================================
-- Backs three app surfaces that today read only fixtures:
--   * /investments  -> holdings              (portfolio + expense-ratio lenses)
--   * goal planner   -> goals                 (SIP / sinking-fund targets)
--   * /networth      -> balance_sheet_items   (Rich-Dad assets vs liabilities)
--
-- All amounts are integer paise (`*_minor` BIGINT), per the golden rule (V2);
-- the app's whole-rupee mocks map rupees <-> paise at the API edge. Expense
-- ratio is stored in BASIS POINTS (0.20% = 20 bps) to stay integer-exact.
-- All three are standard tenant-scoped (FORCE RLS + app.current_tenant).
-- =============================================================================

CREATE TYPE holding_kind      AS ENUM ('index', 'equity', 'debt', 'gold', 'ulip');
CREATE TYPE balance_item_type AS ENUM ('asset', 'liability');


-- ---------- holdings (Holding) ----------
CREATE TABLE holdings (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT         NOT NULL,
  kind              holding_kind NOT NULL,
  invested_minor    BIGINT       NOT NULL,                 -- cost basis (paise)
  value_minor       BIGINT       NOT NULL,                 -- current value (paise)
  expense_ratio_bps INT,                                   -- basis points; NULL = unknown
  regular_plan      BOOLEAN      NOT NULL DEFAULT false,   -- commission-bearing (vs direct)
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT holdings_invested_nonneg CHECK (invested_minor >= 0),
  CONSTRAINT holdings_value_nonneg    CHECK (value_minor    >= 0),
  CONSTRAINT holdings_expense_ratio_range
    CHECK (expense_ratio_bps IS NULL OR (expense_ratio_bps >= 0 AND expense_ratio_bps <= 10000))
);
CREATE INDEX idx_holdings_tenant ON holdings (tenant_id);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings FORCE  ROW LEVEL SECURITY;
CREATE POLICY holdings_tenant_isolation ON holdings
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ---------- goals (Goal / sinking funds) ----------
-- Optional envelope_id links a goal to the savings envelope that funds it.
CREATE TABLE goals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  icon          TEXT,
  target_minor  BIGINT      NOT NULL,
  current_minor BIGINT      NOT NULL DEFAULT 0,
  envelope_id   UUID REFERENCES envelopes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goals_target_pos     CHECK (target_minor  > 0),
  CONSTRAINT goals_current_nonneg CHECK (current_minor >= 0)
);
CREATE INDEX idx_goals_tenant ON goals (tenant_id);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals FORCE  ROW LEVEL SECURITY;
CREATE POLICY goals_tenant_isolation ON goals
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ---------- balance_sheet_items (BalanceItem) ----------
-- income_generating applies to assets only (NULL on liabilities).
CREATE TABLE balance_sheet_items (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_type         balance_item_type NOT NULL,
  name              TEXT              NOT NULL,
  amount_minor      BIGINT            NOT NULL,
  income_generating BOOLEAN,                              -- assets only; NULL for liabilities
  note              TEXT,
  created_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),
  CONSTRAINT balance_sheet_items_amount_nonneg CHECK (amount_minor >= 0),
  -- a liability cannot be flagged income-generating
  CONSTRAINT balance_sheet_items_liability_no_income
    CHECK (item_type = 'asset' OR income_generating IS NULL)
);
CREATE INDEX idx_balance_sheet_items_tenant ON balance_sheet_items (tenant_id);

ALTER TABLE balance_sheet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_sheet_items FORCE  ROW LEVEL SECURITY;
CREATE POLICY balance_sheet_items_tenant_isolation ON balance_sheet_items
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ---------- grants ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON holdings            TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON goals               TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON balance_sheet_items TO ledgerline_app;
