-- =============================================================================
-- M11 — Migration 0006: Categorization rules + envelope→category link
-- =============================================================================
-- v0 of M11 is purely rule-based: a small, ordered list of patterns the user
-- (or future correction UI) attaches to categories. The categoriser evaluates
-- them in priority order on each new transaction's (raw_description, merchant)
-- and assigns the first match. v1 will add an LLM fallback for misses; the
-- schema here is intentionally a strict subset of what v1 needs (additive).
--
-- WHY THIS MIGRATION TOUCHES TWO TABLES
-- -----------------------------------------------------------------------------
-- The bridge from M11 → M12 needs to know WHICH user envelope a categorised
-- spend should hit for a given (tenant, category, period). The natural shape
-- is "the user envelope for this category in this month". That mapping needs
-- somewhere to live; the cleanest place is a nullable `envelopes.category_id`
-- FK so a user envelope OPTIONALLY anchors to a category. The bridge looks up
-- (kind='user', category_id=?, period=YYYY-MM) and posts there; on miss it
-- falls back to the Unallocated pseudo-envelope.
--
-- The column is additive + defaulted NULL, so every existing envelope row
-- becomes an un-anchored envelope automatically. Only `kind='user'` envelopes
-- are ever supposed to set it; we don't enforce that with a check (pseudo
-- envelopes simply never get a category_id assigned by any code path).
--
-- RULES TABLE — SHAPE
-- -----------------------------------------------------------------------------
-- pattern_kind in {contains, equals, regex}:
--   * contains — case-insensitive substring match (the common path)
--   * equals   — case-insensitive exact match (cheap, deterministic)
--   * regex    — Java regex compiled with CASE_INSENSITIVE; broken patterns
--                are logged + skipped in code (defensive, not a hard fail)
-- priority — lower number wins; ties broken by id ordering (deterministic
--            enough for v0; future work can layer in created_at or explicit
--            ordering metadata if it ever matters)
-- enabled  — soft delete / disable without losing the row
--
-- FK to categories uses ON DELETE RESTRICT. The alternative (SET NULL or
-- CASCADE) silently makes rules misfire or vanish — both worse than forcing
-- the caller to disable/delete dependent rules first. A rule with a dangling
-- category is a category-system bug, not normal traffic.
--
-- INDEX on (tenant_id, enabled, priority) supports the categoriser's hot
-- lookup: "give me every enabled rule for THIS tenant in priority order".
-- The leading tenant_id is also what RLS filters on, so this index is the
-- one Postgres will pick for both the policy gate and the order.
-- =============================================================================

-- ---------- envelopes ↔ categories link (additive, default NULL) ----------
-- A user envelope optionally points at the category it represents. The bridge
-- uses this for the (category, period) → envelope lookup. ON DELETE SET NULL
-- means deleting a category does not orphan/destroy the envelope (an envelope
-- with no category still posts; spend just routes via Unallocated for that
-- category going forward).
ALTER TABLE envelopes
  ADD COLUMN category_id UUID NULL REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX idx_envelopes_category ON envelopes (tenant_id, category_id, period);


-- ---------- rule_pattern_kind enum ----------
CREATE TYPE rule_pattern_kind AS ENUM ('contains', 'equals', 'regex');


-- ---------- categorization_rules ----------
CREATE TABLE categorization_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pattern_kind rule_pattern_kind NOT NULL,
  pattern      TEXT              NOT NULL,
  category_id  UUID              NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  priority     INT               NOT NULL DEFAULT 100,
  enabled      BOOLEAN           NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- The categoriser's hot lookup is "all enabled rules for THIS tenant ordered
-- by priority asc". The leading tenant_id also matches the RLS predicate.
CREATE INDEX idx_categorization_rules_eval
  ON categorization_rules (tenant_id, enabled, priority);


-- ---------- RLS (mirror the V3 pattern) ----------
ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorization_rules FORCE  ROW LEVEL SECURITY;
CREATE POLICY categorization_rules_tenant_isolation ON categorization_rules
  USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);


-- ---------- App-role DML grant ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON categorization_rules TO ledgerline_app;
