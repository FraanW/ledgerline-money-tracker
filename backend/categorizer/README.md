# `:categorizer` — M11

The rules-based transaction categoriser **plus** the bridge that wires
the v0 pipeline together end-to-end: **M1 (ingestion) → M11 (this) → M12 (ledger)**.

This module is what closes the v0 happy path. Before it, M1 dropped each
inserted `Transaction` on a no-op publisher; with it on the classpath the
publisher seam is taken over by `CategorizeAndPostPublisher`, and every
ingested **debit** is categorised and posted to its target envelope in the
same DB transaction as the ingest insert.

## What lives here

| Type | Purpose |
|------|---------|
| `CategorizerService`         | Pure rules evaluator. `Optional<UUID> match(tenantId, rawDescription, merchant)` — returns the first matching rule's `category_id`. |
| `CategorizeAndPostPublisher` | The `IngestionEventPublisher` bean. Categorises, persists `transactions.category_id`, resolves the target envelope, calls `LedgerService.postSpend`, with a `WouldGoNegative` → Unallocated fallback. |

The `:categorizer` jar pulls in `:envelope-ledger` and `:ingestion`. Once
`:app` declares `implementation(project(":categorizer"))`, the publisher
bean self-registers via component scan and the M1 v0 no-op steps aside via
its `@ConditionalOnMissingBean(IngestionEventPublisher.class)`. We also
annotate the bridge `@Primary` as belt-and-braces.

## Rule evaluation (4 lines)

1. Inside the tenant RLS context, `SELECT` all `enabled=true` rules ordered by `priority ASC, id ASC`.
2. For each rule, in order, evaluate the pattern against `rawDescription` **and** `merchant` (case-insensitive in every kind).
3. Return the first rule's `category_id`; or empty if nothing matches.
4. A malformed `regex` rule is **logged and skipped** — it does not abort evaluation of the remaining rules.

`pattern_kind` is one of:

- `contains` — case-insensitive substring match (the common path).
- `equals`   — case-insensitive exact match.
- `regex`    — Java regex compiled with `CASE_INSENSITIVE`.

## Target-envelope decision tree

For each ingested debit:

```
        matched a rule?
          /        \
         no         yes
         |           |
         v           v
   Unallocated   user envelope for
   (pseudo)     (category_id, period=YYYY-MM)?
                  /       \
                no         yes
                |           |
                v           v
          Unallocated   that envelope
          (pseudo)
```

Then **post** via `LedgerService.postSpend(tenantId, txnId, target, amount, description)`.
The V5 partial UNIQUE on `(tenant, transaction_id, envelope_id)` makes this
idempotent: a re-call for the same `(txn, envelope)` returns the existing
`transfer_id` and writes nothing.

## Insufficient-funds fallback

If `postSpend` against the user envelope throws `WouldGoNegative` (the M12
never-negative invariant tripping), we catch and **retry against
Unallocated**. The first attempt wrote nothing — `LedgerService` rolls back
the inner transaction before any `ledger_entries` row commits — so V5 sees
no row yet for `(tenant, txn, Unallocated)` and accepts the retry.

This is deliberately not a hard error to the user: the spend really
happened on their bank account, the budget just doesn't currently have
room for it. Routing the excess to Unallocated keeps the ledger honest
(total movement matches reality) and surfaces the problem in the user's
"unbudgeted spend" view rather than dropping the record.

## What v0 explicitly does NOT do

- **No LLM fallback.** v0 is deterministic only. v1 will layer the LLM
  matcher behind the same `match(...)` interface as a second strategy.
- **No corrections-become-rules UI/API.** Rules are inserted via direct DB
  for now; the correction surface is a later milestone.
- **No auto-posting of credits.** v0 only auto-posts `direction = debit`.
  Income arrivals require an explicit user `allocate(...)` so the user
  retains the pre-commit moment that envelope budgeting promises.

## Tests

`src/test/java/com/ledgerline/categorizer/`:

| Test | What it covers |
|------|----------------|
| `CategorizerServiceTest`         | Priority precedence, `enabled=false` ignored, kind variants, no-match, all-disabled, bad-regex-skipped, tenant isolation on the rule set. |
| `CategorizeAndPostPublisherTest` | End-to-end ingest→categorise→post (debit), credit-is-ignored, categorised-with-no-envelope→Unallocated, categorised-with-envelope→that envelope, insufficient-funds→Unallocated fallback, replay idempotency (V5 enforces 1 transfer), tenant isolation on posts. |

Run:

```pwsh
# from backend/
./gradlew.bat :categorizer:test

# alt-port external Postgres (the pattern Worf uses on this machine)
$env:TEST_DATABASE_URL = "jdbc:postgresql://localhost:5433/ledgerline?user=ledgerline&password=ledgerline"
./gradlew.bat :categorizer:test
```
