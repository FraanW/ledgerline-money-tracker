package com.ledgerline.ingestion;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.contracts.CurrencyCode;
import com.ledgerline.contracts.IngestionSource;
import com.ledgerline.contracts.Money;
import com.ledgerline.contracts.Transaction;
import com.ledgerline.platform.db.TenantContext;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * M1 — the ingestion orchestrator.
 *
 * <h2>The pipeline (per upload)</h2>
 * <ol>
 *   <li><b>Parse.</b> Delegate to a {@link StatementParser} strategy. The
 *       parser returns one {@link StatementParser.ParsedRow} per row, EITHER
 *       a good {@link RawStatementRow} OR a per-row error message.</li>
 *   <li><b>Record the batch.</b> Insert the {@code statements} row (V12) FIRST
 *       — {@code status = processing} — so every transaction row can FK back
 *       to its batch via {@code statement_id}.</li>
 *   <li><b>Normalise.</b> Turn each raw row into a domain
 *       {@link Transaction} — stamping in {@code tenantId}, {@code accountId},
 *       {@code source = statement_upload}, {@code dedupHash},
 *       {@code ingestedAt}, and leaving {@code merchant} / {@code categoryId}
 *       null (M3 / M11 fill those in later).</li>
 *   <li><b>Insert with dedup.</b> One {@code INSERT ... ON CONFLICT
 *       (tenant_id, dedup_hash) DO NOTHING RETURNING id} per row. The DB is
 *       the serialisation point — re-uploading the same file is safe.</li>
 *   <li><b>Publish hook.</b> For each genuinely-inserted row, call
 *       {@link IngestionEventPublisher#publishIngested(Transaction)} inside
 *       the same DB transaction. The v0 default is a no-op; the
 *       categorizer's bridge ({@code CategorizeAndPostPublisher}) replaces it
 *       when present; the M4 outbox slots in here too.</li>
 *   <li><b>Finalise the batch.</b> Update the {@code statements} row with the
 *       final counts + per-row errors (jsonb) and {@code status = completed},
 *       still inside the same transaction.</li>
 * </ol>
 *
 * <h2>Why one transaction per file (not one per row)</h2>
 * The whole file ingest runs inside a single
 * {@link TenantContext#withTenant(UUID, java.util.function.Function) withTenant}
 * transaction. Rationale:
 * <ul>
 *   <li>RLS context is established ONCE for the request. Per-row transactions
 *       would re-issue the {@code set_config} N times for no gain.</li>
 *   <li>Per-row failures are surfaced in {@code errors[]}, not thrown — so
 *       the transaction does not roll back on a malformed row. The
 *       {@code ON CONFLICT DO NOTHING} means duplicates do not throw either.</li>
 *   <li>If the DB rejects something we did NOT anticipate (a real exception),
 *       the WHOLE file rolls back — including the {@code statements} row, so
 *       no orphan {@code processing} batches survive a failed upload. v0
 *       chooses correctness over partial success in that one path — the user
 *       retries the upload, and dedup makes the retry safe.</li>
 * </ul>
 *
 * <h2>Identity (Sweep 1)</h2>
 * When the caller identifies an acting user, the transaction runs under
 * {@link TenantContext#withTenantAndUser} so BOTH GUCs
 * ({@code app.current_tenant}, {@code app.current_user_id}) are live. The
 * legacy tenant-only overload remains for header-only v0 callers.
 *
 * <h2>Why no {@code @Transactional} here</h2>
 * Same reason as {@code LedgerService}: the transaction boundary lives in
 * {@link TenantContext#withTenant}, which is the same primitive that scopes
 * RLS. Declarative {@code @Transactional} would re-introduce the proxy-
 * self-invocation footgun for zero gain.
 */
@Service
public class IngestionService {

    private static final Logger log = LoggerFactory.getLogger(IngestionService.class);

    /** Serialises errors[] into the statements.errors jsonb column. */
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Stateless PDF strategy — selected by content sniff, not file name. */
    private static final PdfStatementParser PDF_PARSER = new PdfStatementParser();

    private final TenantContext tenantContext;
    private final StatementParser parser;
    private final IngestionEventPublisher publisher;
    private final MerchantCanonicalizer canonicalizer;

    /** Back-compat ctor (existing tests): canonicalizer abstains on everything. */
    public IngestionService(
        TenantContext tenantContext,
        StatementParser parser,
        IngestionEventPublisher publisher
    ) {
        this(tenantContext, parser, publisher, raws -> Map.of());
    }

    /** Spring uses this one — the M3 seam is injected (Sweep 3). */
    @Autowired
    public IngestionService(
        TenantContext tenantContext,
        StatementParser parser,
        IngestionEventPublisher publisher,
        MerchantCanonicalizer canonicalizer
    ) {
        this.tenantContext = tenantContext;
        this.parser = parser;
        this.publisher = publisher;
        this.canonicalizer = canonicalizer;
    }

    /**
     * Legacy tenant-only entry point (v0 callers, existing tests). Delegates
     * to the identity-aware overload with no acting user and a default file
     * name.
     */
    public IngestionResult ingest(UUID tenantId, UUID accountId, InputStream csv)
        throws IOException, StatementParseException {
        return ingest(tenantId, null, accountId, "statement.csv", csv);
    }

    /** CSV-era overload — delegates with no PDF password. */
    public IngestionResult ingest(
        UUID tenantId, UUID userId, UUID accountId, String fileName, InputStream statement)
        throws IOException, StatementParseException {
        return ingest(tenantId, userId, accountId, fileName, statement, null);
    }

    /**
     * Ingest a statement for {@code (tenantId, accountId)}, optionally on
     * behalf of {@code userId} (nullable until real auth lands). The format is
     * sniffed from the bytes: a {@code %PDF} magic routes to the
     * {@link PdfStatementParser} (unlocked on the fly with
     * {@code pdfPassword}, which lives in memory only and is NEVER logged or
     * persisted); anything else goes to the CSV parser strategy.
     *
     * @throws StatementParseException if the file itself is structurally
     *         unparseable (no header / wrong or missing PDF password /
     *         scanned image PDF). Per-row failures do NOT throw — they
     *         surface in the returned {@code errors[]}.
     */
    public IngestionResult ingest(
        UUID tenantId, UUID userId, UUID accountId, String fileName,
        InputStream statement, String pdfPassword)
        throws IOException, StatementParseException {

        // Step 1 — parse OUTSIDE the DB transaction. Parsing is pure CPU + I/O
        // against the upload; holding a DB transaction open while reading the
        // file would tie up a pooled connection for no reason.
        byte[] bytes = statement.readAllBytes();
        List<StatementParser.ParsedRow> parsed = isPdf(bytes)
            ? PDF_PARSER.parse(bytes, pdfPassword)
            : parser.parse(new java.io.ByteArrayInputStream(bytes));

        // Pre-split: parser errors are surfaced verbatim; good rows go to the
        // normalise+insert phase below.
        List<IngestionResult.RowError> errors = new ArrayList<>();
        List<GoodRow> good = new ArrayList<>(parsed.size());
        for (StatementParser.ParsedRow pr : parsed) {
            if (pr.isOk()) {
                good.add(new GoodRow(pr.lineNumber(), pr.row()));
            } else {
                errors.add(new IngestionResult.RowError(pr.lineNumber(), pr.error()));
            }
        }

        UUID statementId = UUID.randomUUID();

        // M3 (Sweep 3) — canonicalize the batch BEFORE the DB transaction so a
        // slow/down enrichment service can never hold a pooled connection.
        // Best-effort by contract: absent key == abstain == NULL merchant.
        Map<String, String> merchants = canonicalizer.canonicalizeBatch(
            good.stream().map(g -> g.row().rawDescription()).distinct().toList());

        // Steps 2-6 — batch row + normalise + insert + publish + finalise,
        // inside ONE tenant(-and-user) transaction.
        Function<JdbcTemplate, int[]> work = (JdbcTemplate jdbc) ->
            insertAll(jdbc, statementId, tenantId, accountId, fileName, good, merchants, errors);
        int[] counters = (userId == null)
            ? tenantContext.withTenant(tenantId, work)
            : tenantContext.withTenantAndUser(tenantId, userId, work);

        return new IngestionResult(
            statementId,
            parsed.size(),
            counters[0], // accepted
            counters[1], // duplicates
            errors
        );
    }

    /**
     * The DB phase. Records the {@code statements} batch row first, inserts
     * each good row through {@code INSERT ... ON CONFLICT (tenant_id,
     * dedup_hash) DO NOTHING RETURNING id} — the row is either accepted
     * (returns its new id) or silently dropped as a duplicate (returns
     * nothing). For each accepted row, calls the publisher inside this same
     * transaction. Finally stamps the batch row with the outcome.
     *
     * @return {@code [accepted, duplicates]}
     */
    private int[] insertAll(
        JdbcTemplate jdbc,
        UUID statementId,
        UUID tenantId,
        UUID accountId,
        String fileName,
        List<GoodRow> good,
        Map<String, String> merchants,
        List<IngestionResult.RowError> errors
    ) {
        // The batch row FIRST — transactions FK back to it via statement_id.
        jdbc.update(
            """
            INSERT INTO statements (id, tenant_id, account_id, file_name, source, status)
            VALUES (
              ?,
              NULLIF(current_setting('app.current_tenant', true), '')::uuid,
              ?, ?, 'statement_upload'::ingestion_source, 'processing'::statement_status
            )
            """,
            statementId,
            accountId,
            fileName);

        int accepted = 0;
        int duplicates = 0;
        Instant ingestedAt = Instant.now();

        for (GoodRow g : good) {
            RawStatementRow raw = g.row();
            // dedupHash deliberately EXCLUDES merchant — canonicalization
            // becoming available later must not make old rows re-ingestable.
            String dedupHash = DedupHasher.hash(
                accountId,
                raw.postedAt(),
                raw.amountMinor(),
                raw.direction(),
                raw.rawDescription());
            String merchant = merchants.get(raw.rawDescription());

            try {
                UUID newId;
                try {
                    // ON CONFLICT DO NOTHING + RETURNING id:
                    //   - If the row is new: returns the freshly-minted id.
                    //   - If the (tenant_id, dedup_hash) UNIQUE collides: the
                    //     INSERT writes nothing and the RETURNING gives back
                    //     zero rows. queryForObject then throws
                    //     EmptyResultDataAccessException, which is our
                    //     "duplicate" signal. This is the recommended PG
                    //     pattern — we never need a SELECT-then-INSERT race.
                    newId = jdbc.queryForObject(
                        """
                        INSERT INTO transactions (
                          tenant_id, account_id, posted_at, amount_minor, currency,
                          direction, raw_description, merchant, source, dedup_hash,
                          ingested_at, statement_id
                        ) VALUES (
                          NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                          ?, ?, ?, 'INR'::currency_code,
                          ?::transaction_direction, ?, ?, 'statement_upload'::ingestion_source,
                          ?, ?, ?
                        )
                        ON CONFLICT (tenant_id, dedup_hash) DO NOTHING
                        RETURNING id
                        """,
                        UUID.class,
                        accountId,
                        raw.postedAt(),
                        raw.amountMinor(),
                        raw.direction().name(),
                        raw.rawDescription(),
                        merchant,
                        dedupHash,
                        java.sql.Timestamp.from(ingestedAt),
                        statementId);
                } catch (EmptyResultDataAccessException duplicate) {
                    duplicates++;
                    continue;
                }

                // Successfully inserted — build the domain Transaction and
                // fire the publisher hook (no-op in v0; the categorizer
                // bridge / M4 outbox slot in here).
                Transaction txn = new Transaction(
                    newId,
                    tenantId,
                    accountId,
                    raw.postedAt(),
                    new Money(raw.amountMinor(), CurrencyCode.INR),
                    raw.direction(),
                    raw.rawDescription(),
                    merchant,                      // M3 — null when abstained
                    null,                          // categoryId — M11
                    IngestionSource.statement_upload,
                    dedupHash,
                    ingestedAt
                );
                publisher.publishIngested(txn);
                accepted++;
            } catch (RuntimeException rowFailure) {
                // A DB-level surprise for this single row (e.g. an FK
                // violation because accountId is wrong for the tenant). One
                // row's failure does NOT poison the file — surface in errors
                // and continue. Note: a real exception will already have
                // rolled back the savepoint-less transaction, so subsequent
                // inserts would fail too. To preserve "one bad row does not
                // poison the rest" the controller should validate accountId
                // up front (we do); any *truly* unexpected DB error here is
                // intentionally surfaced and the whole txn rolls back via
                // the rethrow below — the caller retries the whole upload,
                // which is safe because dedup will absorb the duplicates.
                // Log the JDBC/Postgres detail server-side ONLY — returning it
                // to the client would leak schema (constraint/column names) to
                // a caller (Tasha finding #7). The client gets a generic message.
                log.warn("ingest row {} failed: {}: {}",
                    g.lineNumber(), rowFailure.getClass().getSimpleName(), rowFailure.getMessage());
                errors.add(new IngestionResult.RowError(
                    g.lineNumber(), "row could not be stored"));
                throw rowFailure;
            }
        }

        // Finalise the batch row — same transaction, so a crash between the
        // INSERT above and here rolls back both (no orphan 'processing' rows).
        jdbc.update(
            """
            UPDATE statements
            SET accepted_count = ?, duplicate_count = ?, error_count = ?,
                errors = ?::jsonb, status = 'completed'::statement_status
            WHERE id = ?
            """,
            accepted,
            duplicates,
            errors.size(),
            errorsJson(errors),
            statementId);

        return new int[]{accepted, duplicates};
    }

    /** {@code %PDF-} magic at byte 0 — content beats file extension. */
    private static boolean isPdf(byte[] bytes) {
        return bytes.length >= 5
            && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D'
            && bytes[3] == 'F' && bytes[4] == '-';
    }

    /** errors[] → jsonb payload; NULL when the batch was clean. */
    private static String errorsJson(List<IngestionResult.RowError> errors) {
        if (errors.isEmpty()) {
            return null;
        }
        try {
            return JSON.writeValueAsString(errors);
        } catch (JsonProcessingException e) {
            // Telemetry must never break ingestion — log and store NULL.
            log.warn("could not serialise statement errors[] to jsonb", e);
            return null;
        }
    }

    /** A parser row that survived parsing — paired with its source line number. */
    private record GoodRow(int lineNumber, RawStatementRow row) {}
}
