# ingestion — M1

The v0 front door of the Money Tracker pipeline: parse a bank-statement upload, normalise each row into a domain `Transaction`, and insert with `ON CONFLICT (tenant_id, dedup_hash) DO NOTHING` so the DB itself absorbs duplicates idempotently.

## What lives here

- `StatementParser` — the strategy interface (one impl per format). v0 ships **`CsvStatementParser`**. PDF, Account Aggregator (v1), and any new bank-specific CSV slot in here.
- `RawStatementRow` — the parser's output IR: post date, positive amount in paise, direction, raw description.
- `DedupHasher` — `sha256(accountId | postedAt | amount.minor | direction | rawDescription)` joined with `|` and hex-encoded.
- `IngestionEventPublisher` — the M4 transactional-outbox seam (no-op in v0).
- `IngestionService` — the orchestrator: parse → normalise → dedup-insert → publish hook.
- `StatementIngestionController` — `POST /api/v0/ingest/statement` (multipart).

## The pipeline

1. **HTTP layer** — `POST /api/v0/ingest/statement`, multipart upload of the CSV plus `accountId` form field; tenant comes from `X-Tenant-Id` header (v0 has no auth — explicitly deferred).
2. **Parse** — `CsvStatementParser` (Apache Commons CSV, header-name-driven). Per-row failures DO NOT throw; they surface in the response's `errors[]`. A structurally broken file (missing header) throws and is mapped to HTTP 400.
3. **Normalise** — each `RawStatementRow` is stamped with `tenantId` (from RLS context), `accountId`, `source = statement_upload`, `dedupHash`, `ingestedAt`; `merchant` and `categoryId` are left null (M3 / M11 fill them later).
4. **Dedup-insert** — single SQL: `INSERT … ON CONFLICT (tenant_id, dedup_hash) DO NOTHING RETURNING id`. New row: returns the new id (counted as `accepted`). Existing row: returns nothing → counted as `duplicate`. No SELECT-then-INSERT race.
5. **Publish hook** — for each newly-inserted row, call `IngestionEventPublisher.publishIngested(...)` inside the same DB transaction. v0 default is the no-op bean; M4 will register an outbox-writing impl with no service code change.

## v0 CSV format

```
Date,Description,Debit,Credit
2026-05-01,UPI/BIGBAZAAR/...,1499.50,
2026-05-02,SALARY CREDIT,,50000.00
```

- `Date` accepts `yyyy-MM-dd`, `dd/MM/yyyy`, `dd-MM-yyyy` — the common Indian-bank export formats.
- Exactly one of `Debit` / `Credit` must be non-blank per row; that encodes `direction`.
- Amounts parsed as `BigDecimal`, scaled to 2dp HALF_UP, shifted to paise via `movePointRight(2).longValueExact()` — **never** a `double`.
- BOM-tolerant (Excel-saved CSVs).

The parser is one impl behind the `StatementParser` interface; adding a new bank format is a new class + a bean registration, not a rewrite. The v1 Account Aggregator adapter slots in here too — it just emits `RawStatementRow`s like the CSV parser does.

## Dedup hash format

`dedup_hash` = lowercase hex SHA-256 of:

```
<accountId> | <postedAt yyyy-MM-dd> | <amountMinor> | <direction> | <rawDescription>
```

The fields before `rawDescription` all have fixed grammar (UUID, ISO date, decimal long, enum name) so a literal `|` inside `rawDescription` cannot collide with a different prefix shape — the field boundary is unambiguous because `rawDescription` is last. `tenantId` is deliberately NOT part of the hash; the DB UNIQUE is `(tenant_id, dedup_hash)` so the tenant already scopes uniqueness.

## Publisher hook (M4 seam)

```java
public interface IngestionEventPublisher {
    void publishIngested(Transaction transaction);
}
```

v0 default: `NoOpIngestionEventPublisher` (TRACE-logs only). When M4 lands, the outbox impl registers itself as a `@Bean` of this type; the no-op steps aside via `@ConditionalOnMissingBean`. The implementation must run inside the SAME DB transaction as the insert — which is guaranteed because the service calls it from inside the `withTenant(...)` block.

## What's NOT in v0 (boundaries)

- **M4 outbox / Kafka** — only the interface; no Redpanda dependency.
- **M11 categoriser** — `category_id` stays null on insert.
- **M12 ledger posting** — the eventual `postSpend` lands when M11 categorises, not here.
- **PDF parsing** — CSV only; PDF is the next strategy implementation.
- **Auth** — `X-Tenant-Id` header is fine for v0 (documented; explicitly deferred).
- **AA / FIU** — v1 (per ADR-0003).

## Tests

Same harness shape as `LedgerServiceTest`: Testcontainers Postgres if Docker is reachable, else external alt-port via `TEST_DATABASE_URL`. Suite covers:

- happy-path CSV parse + normalise (`CsvStatementParserTest`, no DB).
- deterministic + collision-free dedup hash (`DedupHasherTest`, no DB).
- end-to-end dedup-insert under tenant context (`IngestionServiceTest`).
- HTTP smoke (`StatementIngestionControllerTest`, MockMvc).
- tenant isolation (`IngestionServiceTest#tenant_isolation_holds`).

Worf gets the adversarial battery next.
