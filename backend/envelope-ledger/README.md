# envelope-ledger — M12

The never-negative double-entry envelope ledger. The correctness floor the whole product rests on.

## What lives here

- `LedgerService` — the three public operations (`allocate`, `postSpend`, `rollover`) and the internal `postTransferInternal` primitive every one of them funnels through.
- `EnvelopeKind` — the Java mirror of the `envelope_kind` enum added in migration V4.
- `PseudoAccountResolver` — lazily resolves the tenant's Income / Unallocated / Spent rows.
- `LedgerException` — the typed invariant-violation hierarchy (`NotBalanced`, `WouldGoNegative`, `InvalidArguments`).

## Pseudo-account representation (the choice)

Every double-entry movement needs two ends. Real user envelopes (Groceries 2026-05, Rent 2026-05) sit on one side; the other side is one of three **pseudo-accounts**:

| Pseudo | Used for | Balance signature |
|---|---|---|
| `income` | source of incoming income (Income → Unallocated) | accumulates negative |
| `unallocated` | money received but not yet budgeted | swings positive then back to ~0 as money is allocated out |
| `spent` | sink-side of every spend (Groceries → Spent) | accumulates positive |

**Representation: a `kind` enum column on `envelopes` (added in V4), not a magic `period = 'system'` sentinel.**

- One row per `(tenant_id, kind)` for the three non-user kinds, enforced by a partial `UNIQUE` index — `find this tenant's Income/Unallocated/Spent` is a deterministic, single-row lookup.
- The never-negative invariant is checked **only for `kind = 'user'` rows**. Pseudo-accounts must be allowed to swing negative (Income) or positive (Spent) freely — they exist precisely to anchor those signs.
- Pseudo-accounts are **not period-scoped**; the V4 unique index excludes `kind = 'user'`. Their `period` column carries the sentinel string `"system"` only to satisfy the existing `NOT NULL` constraint — code never keys off it.
- Rejected alternative: encoding the same idea via `period = 'system'` and no new column. Cheaper, but it couples two concerns onto one column and turns the never-negative SQL predicate into a brittle `WHERE period <> 'system'`. A typed `kind` makes the structural distinction first-class.

## The transfer primitive

`postTransferInternal` is the one code path every public operation funnels through. The sequence (all inside the caller's `TenantContext.withTenant(...)` transaction):

1. **Sum-to-zero check** on the in-memory entry list (cheap, throws `NotBalanced` if not).
2. **Lock the touched envelopes** with `SELECT id, kind FROM envelopes WHERE id = ? FOR UPDATE`. Envelopes are locked in ascending UUID order so concurrent posters acquire locks deterministically — no cyclic deadlocks.
3. **Never-negative check** for each `kind = 'user'` envelope: re-compute its current derived balance from `ledger_entries` (`COALESCE(SUM(delta_minor), 0)`), check `current + net_delta >= 0`, throw `WouldGoNegative` if not. The lock taken above guarantees no concurrent transaction can interleave between the SUM and the INSERTs below.
4. **INSERT** the `ledger_transfers` parent row, then INSERT each `ledger_entries` child row.
5. **UPDATE `envelopes.balance_minor`** for every touched envelope to keep the materialised column in sync. This column is a denorm cache for fast list-views; the authoritative balance is always `SUM(delta_minor)`.

## Why no `@Transactional` on the service

The transaction boundary lives in `TenantContext.withTenant(...)` — the same `TransactionTemplate`-driven entry point that sets the RLS tenant GUC. Driving transactions explicitly through that primitive (rather than declaratively via `@Transactional`) sidesteps the proxy self-invocation footgun: a `this.method()` call inside a `@Transactional` bean silently bypasses the proxy and runs **without** a transaction, which would silently break both ledger invariants under load.

See `context/learning/spring-boot/05-data-and-transactions.md` and `09-platform-db-and-tenantcontext.md`.

## Idempotency for `postSpend`

`postSpend` is idempotent on `transactionId`. Before posting anything it does:

```sql
SELECT transfer_id FROM ledger_entries WHERE transaction_id = ? LIMIT 1
```

(RLS scopes this to the current tenant.) If a row exists, the existing `transferId` is returned and nothing is written. Replays of the same upstream `transaction.categorized` event are safe.

## Rollover is not a special case

Per `ADR-0005`, rollover is **just another balanced transfer**. The orchestrator:

1. Lists `kind = 'user'` envelopes in `fromPeriod` whose derived balance is positive.
2. For each, ensures the matching envelope exists in `toPeriod` (created on demand, same name).
3. Posts a balanced transfer (`-balance` on the old row, `+balance` on the new) through the same `postTransferInternal` — sum-to-zero and never-negative invariants cover it unchanged.
