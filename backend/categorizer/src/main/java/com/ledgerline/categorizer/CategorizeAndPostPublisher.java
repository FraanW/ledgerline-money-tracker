package com.ledgerline.categorizer;

import com.ledgerline.contracts.Transaction;
import com.ledgerline.contracts.TransactionDirection;
import com.ledgerline.ingestion.IngestionEventPublisher;
import com.ledgerline.ledger.EnvelopeKind;
import com.ledgerline.ledger.LedgerException;
import com.ledgerline.ledger.LedgerService;
import com.ledgerline.platform.db.TenantContext;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The M1 → M11 → M12 bridge.
 *
 * <p>Replaces M1's v0 {@code NoOpIngestionEventPublisher}. On each ingested
 * {@link Transaction} this bean categorises (M11) and posts (M12) in a
 * single, idempotent end-to-end step.
 *
 * <h2>Per-transaction algorithm</h2>
 * <ol>
 *   <li><b>Skip credits.</b> v0 of M11 only auto-posts {@code debit} (spend)
 *       transactions. Credits (income) require an explicit user allocation
 *       through {@link LedgerService#allocate} — auto-allocating "income"
 *       would silently change where the user thinks their money lives, which
 *       is exactly the opposite of envelope budgeting's pre-commit promise.</li>
 *   <li><b>Categorise.</b> Look up a matching rule and persist
 *       {@code transactions.category_id} (may be null on no match).</li>
 *   <li><b>Resolve target envelope.</b> If a category matched AND a user
 *       envelope exists for {@code (category, period=YYYY-MM(postedAt))},
 *       post against it. Otherwise post against the tenant's Unallocated
 *       pseudo-envelope.</li>
 *   <li><b>Post.</b> Call {@link LedgerService#postSpend}. The V5 partial
 *       UNIQUE on {@code (tenant, txn, envelope)} makes this idempotent —
 *       a repeat call for the SAME {@code (txn, envelope)} returns the
 *       existing transferId without writing anything.</li>
 *   <li><b>Insufficient-funds fallback.</b> If the user envelope rejects with
 *       {@link LedgerException.WouldGoNegative}, re-post against Unallocated.
 *       The failed user-envelope attempt wrote nothing (rollback inside
 *       LedgerService), so the V5 key {@code (tenant, txn, envelope)}
 *       differs on the retry — V5 permits it, exactly as intended.</li>
 * </ol>
 *
 * <h2>End-to-end idempotency</h2>
 * Ingestion: V2's {@code transactions_tenant_dedup_unique} drops re-uploads
 * before the publisher ever sees them. Categorisation: rules are pure
 * functions of (rawDescription, merchant) — re-evaluation gives the same
 * answer. Posting: V5 ensures at most one spend transfer per
 * {@code (tenant, txn, envelope)}.
 *
 * <p><b>Note on the WouldGoNegative retry interaction with V5:</b> on the
 * first attempt, the failed user-envelope post writes nothing — the
 * exception rolls back the inner transaction in {@link LedgerService} BEFORE
 * any {@code ledger_entries} row gets committed. So when we retry against
 * Unallocated, V5 sees no prior row for this {@code (tenant, txn,
 * Unallocated)} pair and accepts the insert. A FUTURE replay of the same
 * transaction will short-circuit on the Unallocated insert via V5 and return
 * the cached transferId without re-trying the original user envelope.
 *
 * <h2>Registration vs the v0 no-op</h2>
 * Annotated {@link Primary} and a Spring bean; the v0
 * {@code NoOpIngestionEventPublisher} keeps its
 * {@code @ConditionalOnMissingBean(IngestionEventPublisher.class)}, so it
 * registers ONLY when no other {@link IngestionEventPublisher} bean exists.
 * The {@code :categorizer} module being on the classpath alone is enough to
 * step the no-op aside. (We add {@code @Primary} as belt-and-braces in case
 * a future module ever brings in a second non-no-op publisher.)
 */
@Component
@Primary
public class CategorizeAndPostPublisher implements IngestionEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(CategorizeAndPostPublisher.class);

    /** YYYY-MM derived from posted_at — matches the envelopes.period text format. */
    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

    /** Cap on the description hung on ledger_transfers so the row stays small. */
    private static final int DESCRIPTION_MAX = 200;

    private final CategorizerService categorizer;
    private final LedgerService ledger;
    private final TenantContext tenantContext;

    public CategorizeAndPostPublisher(
        CategorizerService categorizer,
        LedgerService ledger,
        TenantContext tenantContext
    ) {
        this.categorizer = categorizer;
        this.ledger = ledger;
        this.tenantContext = tenantContext;
    }

    @Override
    public void publishIngested(Transaction transaction) {
        // ---- 1. Skip credits. v0 does not auto-post income arrivals. ----
        if (transaction.direction() != TransactionDirection.debit) {
            if (log.isTraceEnabled()) {
                log.trace("categorizer: skipping non-debit txn={} direction={}",
                    transaction.id(), transaction.direction());
            }
            return;
        }

        UUID tenantId = transaction.tenantId();
        UUID txnId = transaction.id();
        long amountMinor = transaction.amount().minor();

        // ---- 2. Categorise + persist category_id ----
        Optional<UUID> matched = categorizer.match(
            tenantId, transaction.rawDescription(), transaction.merchant());

        matched.ifPresent(categoryId ->
            tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
                // RLS already scopes the UPDATE; the explicit tenant_id clause
                // is defence-in-depth and matches the pattern used elsewhere.
                jdbc.update(
                    "UPDATE transactions SET category_id = ? WHERE id = ? AND tenant_id = ?",
                    categoryId, txnId, tenantId);
            }));

        // ---- 3. Resolve target envelope ----
        String period = transaction.postedAt().format(PERIOD_FMT);
        UUID targetEnvelope = resolveTargetEnvelope(tenantId, matched.orElse(null), period);

        String description = truncate(
            "spend: " + safeText(transaction.rawDescription()), DESCRIPTION_MAX);

        // ---- 4 + 5. Post to M12, with WouldGoNegative fallback ----
        try {
            ledger.postSpend(tenantId, txnId, targetEnvelope, amountMinor, description);
        } catch (LedgerException.WouldGoNegative tooLow) {
            // The user envelope cannot absorb this spend; re-route to
            // Unallocated. V5 permits this because (tenant, txn, envelope)
            // differs from the (failed, never-committed) original attempt.
            UUID unallocated = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
            if (targetEnvelope.equals(unallocated)) {
                // Pathological — Unallocated is a pseudo and never enforces
                // never-negative, so this branch should not be reachable. Log
                // and rethrow so we don't silently swallow a real problem.
                log.error("categorizer: Unallocated rejected as WouldGoNegative for txn={} — "
                    + "this indicates a ledger invariant bug, NOT a user-funding shortfall",
                    txnId);
                throw tooLow;
            }
            if (log.isDebugEnabled()) {
                log.debug("categorizer: WouldGoNegative on target={} for txn={}, falling back to Unallocated",
                    targetEnvelope, txnId);
            }
            ledger.postSpend(tenantId, txnId, unallocated, amountMinor,
                truncate("spend (fallback): " + safeText(transaction.rawDescription()),
                    DESCRIPTION_MAX));
        }
    }

    /**
     * Decision tree for the post-target:
     * <pre>
     *   matched category? --no--> Unallocated (pseudo)
     *           |
     *          yes
     *           |
     *           v
     *   SELECT user envelope WHERE category_id=? AND period=?
     *           |
     *      found? --no--> Unallocated (pseudo)
     *           |
     *          yes
     *           |
     *           v
     *      that envelope id
     * </pre>
     */
    private UUID resolveTargetEnvelope(UUID tenantId, UUID categoryId, String period) {
        if (categoryId == null) {
            return ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        }
        Optional<UUID> userEnv = tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
            try {
                return Optional.of(jdbc.queryForObject(
                    """
                    SELECT id FROM envelopes
                    WHERE kind = 'user' AND category_id = ? AND period = ?
                    LIMIT 1
                    """,
                    UUID.class,
                    categoryId, period));
            } catch (EmptyResultDataAccessException none) {
                return Optional.<UUID>empty();
            }
        });
        return userEnv.orElseGet(() ->
            ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated));
    }

    private static String safeText(String s) {
        return s == null ? "" : s;
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }
}
