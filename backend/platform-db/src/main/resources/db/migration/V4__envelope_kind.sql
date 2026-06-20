-- =============================================================================
-- M12 — Migration 0004: Envelope kind (pseudo-account discriminator)
-- =============================================================================
-- The M12 envelope ledger is double-entry: every movement is a transfer whose
-- signed deltas sum to zero. That means real user envelopes (Groceries, Fun,
-- Rent) need PSEUDO-ACCOUNT counterparts to anchor the two ends of:
--
--   * income arrival     : Income     -> Unallocated
--   * allocation         : Unallocated -> Groceries
--   * spend posting      : Groceries  -> Spent
--   * re-budget          : Groceries  -> Fun           (no pseudo needed)
--   * rollover           : Groceries(M)-> Groceries(M+1) (no pseudo needed)
--
-- "Income", "Unallocated", and "Spent" are not normal user envelopes — they
-- represent the outside world / the money-not-yet-budgeted bucket / the
-- already-spent sink. Two structural differences from a user envelope:
--
--   (a) they are NOT period-scoped (one row per tenant, lifetime is the tenant);
--   (b) the NEVER-NEGATIVE invariant does NOT apply to them — Income
--       naturally accumulates a negative balance (money flows OUT of it into
--       Unallocated), Spent accumulates positive (money flows IN as users
--       spend). The invariant only protects real user envelopes from being
--       overspent.
--
-- WHY A NEW COLUMN AND NOT A MAGIC "period = 'system'" SENTINEL
-- -----------------------------------------------------------------------------
-- A magic-string sentinel would couple two concerns onto one column (period AND
-- pseudo-account-ness), and the never-negative check would become a brittle
-- "WHERE period <> 'system'". An explicit `kind` enum makes the structural type
-- of the envelope first-class:
--
--   * the never-negative SQL predicate is `WHERE kind = 'user'` — crisp, indexed
--     if it ever needs to be, and impossible to typo into a bug;
--   * a tenant has at most one row per (tenant_id, kind) for pseudo kinds, which
--     we enforce with a partial UNIQUE index below;
--   * adding future pseudo-kinds (e.g. an external-transfer ledger anchor) is
--     additive.
--
-- ADDITIVE-ONLY, NO BACKFILL CONFLICTS
-- -----------------------------------------------------------------------------
-- The column is added with a server-side DEFAULT of 'user', so every existing
-- envelope row is implicitly a user envelope. No data migration is needed; this
-- migration only widens the schema.
-- =============================================================================

-- Enum: envelope_kind = 'user' | 'income' | 'unallocated' | 'spent'
-- 'user'        — a real, period-scoped budget envelope (Groceries 2026-05, ...)
-- 'income'      — pseudo-account: source-side counterpart of incoming income
-- 'unallocated' — pseudo-account: money received but not yet budgeted
-- 'spent'       — pseudo-account: sink-side counterpart of an outgoing spend
CREATE TYPE envelope_kind AS ENUM ('user', 'income', 'unallocated', 'spent');

ALTER TABLE envelopes
  ADD COLUMN kind envelope_kind NOT NULL DEFAULT 'user';

-- One pseudo-account row per (tenant, kind) for the three non-user kinds. This
-- is the integrity rule that makes "find this tenant's Income/Unallocated/Spent"
-- a deterministic, single-row lookup. The partial WHERE excludes user kinds, so
-- a tenant can have any number of period-scoped user envelopes named anything.
CREATE UNIQUE INDEX uq_envelopes_tenant_pseudo_kind
  ON envelopes (tenant_id, kind)
  WHERE kind <> 'user';
