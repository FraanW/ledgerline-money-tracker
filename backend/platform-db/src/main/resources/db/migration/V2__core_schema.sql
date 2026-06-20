-- =============================================================================
-- M5 — Migration 0002: Core tenant-scoped schema
-- =============================================================================
-- The SQL mirror of packages/types/src/domain.ts (+ money.ts), field-for-field.
--
-- GOLDEN RULE OF MONEY
-- -----------------------------------------------------------------------------
-- Money is an integer count of minor units (paise). It is stored as a BIGINT
-- column named `*_minor` plus a `currency` column — NEVER numeric/float. This
-- mirrors the Money value type { minor: number; currency: "INR" }. BIGINT gives
-- us ±9.2e18 paise of headroom — no realistic ledger overflows it.
--
-- ENUMS
-- -----------------------------------------------------------------------------
-- The TS string unions become Postgres ENUM types so the DB rejects bad values
-- at write time (the same guarantee the TS compiler gives at build time).
--
-- TENANCY
-- -----------------------------------------------------------------------------
-- Every tenant-scoped table carries tenant_id UUID NOT NULL REFERENCES tenants.
-- RLS (migration 0003) keys off this column. The FK gives referential integrity;
-- RLS gives isolation. They are independent and both required.
--
-- PARTITIONING — DELIBERATELY OUT OF SCOPE FOR v0
-- -----------------------------------------------------------------------------
-- A production deploy at scale would range-partition `transactions` and
-- `ledger_entries` by (tenant_id, month-of-posted_at) to keep per-tenant scans
-- and index bloat bounded. For the v0 prototype, RLS + the indexes below are
-- sufficient and partitioning would be premature complexity. This is a
-- documented future step (see infra/db/migrations/README.md), NOT an omission.
-- =============================================================================

-- ---------- Enumerated domains (mirror the TS unions in domain.ts) ----------

-- TransactionDirection = "debit" | "credit"
CREATE TYPE transaction_direction AS ENUM ('debit', 'credit');

-- IngestionSource = "statement_upload" | "account_aggregator"
-- v0 only ever writes 'statement_upload'; v1 adds 'account_aggregator'.
CREATE TYPE ingestion_source AS ENUM ('statement_upload', 'account_aggregator');

-- CategoryKind = "income" | "expense" | "transfer"
CREATE TYPE category_kind AS ENUM ('income', 'expense', 'transfer');

-- AccountType = "savings" | "current" | "credit_card" | "other"
CREATE TYPE account_type AS ENUM ('savings', 'current', 'credit_card', 'other');

-- CurrencyCode = "INR" (single member today; an enum lets us add currencies
-- later without a column-type migration).
CREATE TYPE currency_code AS ENUM ('INR');


-- ---------- tenants — the isolation boundary (Tenant) ----------
-- NOT tenant-scoped itself: it IS the tenant table. No RLS on it (a row here
-- defines a tenant). Access to tenants is an admin/control-plane concern.
CREATE TABLE tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------- accounts (Account) ----------
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  institution   TEXT          NOT NULL,                  -- e.g. "HDFC Bank"
  account_type  account_type  NOT NULL,
  masked_number TEXT          NOT NULL,                  -- tail only, e.g. "XXXX1234"
  currency      currency_code NOT NULL DEFAULT 'INR',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_tenant ON accounts (tenant_id);


-- ---------- categories (Category) ----------
CREATE TABLE categories (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name      TEXT          NOT NULL,                       -- e.g. "Groceries"
  kind      category_kind NOT NULL
);
CREATE INDEX idx_categories_tenant ON categories (tenant_id);


-- ---------- transactions (Transaction) ----------
-- amount is a POSITIVE magnitude (amount_minor >= 0); `direction` carries the
-- sign meaning (debit = leaving, credit = arriving). merchant + category_id are
-- nullable: filled in after ingestion by M3 (canonicalisation) and M11
-- (categoriser) respectively.
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID                  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id      UUID                  NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  posted_at       DATE                  NOT NULL,         -- date the bank posted it
  amount_minor    BIGINT                NOT NULL,         -- paise, positive magnitude
  currency        currency_code         NOT NULL DEFAULT 'INR',
  direction       transaction_direction NOT NULL,
  raw_description TEXT                  NOT NULL,         -- verbatim statement text
  merchant        TEXT,                                   -- canonicalised; NULL until M3
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL, -- NULL until M11
  source          ingestion_source      NOT NULL,
  -- Idempotency key: stable hash of
  -- (account_id | posted_at | amount_minor | direction | raw_description).
  dedup_hash      TEXT                  NOT NULL,
  ingested_at     TIMESTAMPTZ           NOT NULL DEFAULT now(),

  -- amount is a magnitude, never negative; the sign lives in `direction`.
  CONSTRAINT transactions_amount_nonnegative CHECK (amount_minor >= 0),

  -- IDEMPOTENT INGESTION: re-uploading the same statement produces identical
  -- dedup_hashes, so this UNIQUE constraint (scoped per tenant) drops the
  -- duplicate instead of double-counting. Scoping by tenant_id keeps the same
  -- hash from two different tenants from colliding.
  CONSTRAINT transactions_tenant_dedup_unique UNIQUE (tenant_id, dedup_hash)
);
CREATE INDEX idx_transactions_tenant    ON transactions (tenant_id);
CREATE INDEX idx_transactions_account   ON transactions (account_id);
CREATE INDEX idx_transactions_posted_at ON transactions (tenant_id, posted_at);
CREATE INDEX idx_transactions_category  ON transactions (category_id);


-- ---------- envelopes (Envelope) ----------
-- balance is DERIVED (sum of this envelope's ledger_entries.delta_minor). We
-- store it as a materialised column the M12 service keeps in sync; it is the
-- column the never-negative invariant is asserted against. The invariant
-- ENFORCEMENT is M12's job (see ledger_entries note below) — the schema only
-- needs to be able to HOLD the balance.
CREATE TABLE envelopes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,                   -- e.g. "Groceries"
  balance_minor BIGINT        NOT NULL DEFAULT 0,         -- paise; derived, never negative (M12)
  currency      currency_code NOT NULL DEFAULT 'INR',
  period        TEXT          NOT NULL,                   -- e.g. "2026-05"
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_envelopes_tenant ON envelopes (tenant_id);


-- ---------- ledger_transfers — the grouping table for double-entry movements ----------
-- A "transfer" is a single movement of money composed of two-or-more balanced
-- ledger_entries whose signed deltas sum to zero. domain.ts models the transfer
-- implicitly as "the set of entries sharing a transferId"; we make it an
-- explicit row so the grouping has a clean FK target, a created_at, and a place
-- to hang a description / future metadata. This is the optional grouping table
-- the brief allowed — judged cleaner than a bare shared id.
CREATE TABLE ledger_transfers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  description TEXT,                                        -- e.g. "spend: Groceries", "rebudget"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_transfers_tenant ON ledger_transfers (tenant_id);


-- ---------- ledger_entries (LedgerEntry) ----------
-- Double-entry: every movement is a `transfer_id` group of entries whose signed
-- delta_minor values sum to zero. A spend entry references the originating bank
-- transaction (transaction_id); a pure re-budget references none.
--
-- TWO INVARIANTS THIS SCHEMA SUPPORTS BUT DOES NOT ENFORCE (M12's job):
--   (a) DOUBLE-ENTRY: per transfer_id, SUM(delta_minor) = 0.
--   (b) NEVER-NEGATIVE: no envelope's running balance is driven below zero.
-- These are *transactional, multi-row* invariants. Enforcing them correctly and
-- atomically is the M12 envelope-ledger service's responsibility (it wraps the
-- inserts + the envelopes.balance_minor update + the assertions in one
-- transaction). This migration deliberately does NOT add a CHECK/trigger for
-- them — see docs/MODULE-MAP.md (M12) and the brief. The schema is shaped so
-- that enforcement is *possible*: transfer_id groups the entries, delta_minor is
-- signed, and balance_minor lives on envelopes to assert against.
CREATE TABLE ledger_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id    UUID        NOT NULL REFERENCES ledger_transfers(id) ON DELETE CASCADE,
  envelope_id    UUID        NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
  delta_minor    BIGINT      NOT NULL,                    -- signed: credit +, debit -
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL, -- NULL for pure re-budget
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_entries_tenant      ON ledger_entries (tenant_id);
CREATE INDEX idx_ledger_entries_transfer    ON ledger_entries (transfer_id);
CREATE INDEX idx_ledger_entries_envelope    ON ledger_entries (envelope_id);
CREATE INDEX idx_ledger_entries_transaction ON ledger_entries (transaction_id);


-- ---------- App-role table grants ----------
-- The runtime role gets DML on every tenant table — never DDL, never on the
-- sequences-as-DDL sense. INSERT/SELECT/UPDATE/DELETE only; RLS (migration 0003)
-- then constrains WHICH rows those verbs can touch.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenants,
  accounts,
  categories,
  transactions,
  envelopes,
  ledger_transfers,
  ledger_entries
TO ledgerline_app;
