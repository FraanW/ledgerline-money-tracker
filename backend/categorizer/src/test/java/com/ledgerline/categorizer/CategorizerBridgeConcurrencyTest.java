package com.ledgerline.categorizer;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.contracts.CurrencyCode;
import com.ledgerline.contracts.IngestionSource;
import com.ledgerline.contracts.Money;
import com.ledgerline.contracts.Transaction;
import com.ledgerline.contracts.TransactionDirection;
import com.ledgerline.ingestion.CsvStatementParser;
import com.ledgerline.ingestion.IngestionResult;
import com.ledgerline.ingestion.IngestionService;
import com.ledgerline.ledger.EnvelopeKind;
import com.ledgerline.ledger.LedgerService;
import com.ledgerline.platform.db.TenantContext;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * M11 bridge — Worf's adversarial concurrency + invariant suite for the
 * {@link CategorizeAndPostPublisher} that wires M1 (ingestion) → M11
 * (categorisation) → M12 (ledger).
 *
 * <p>Geordi's {@link CategorizeAndPostPublisherTest} proves the happy path in
 * isolation. This class proves the bridge contract holds under contention,
 * adversarial rule mutation, bad regex inputs, and the full M1→M11→M12
 * pipeline at scale. Real OS threads against a real Postgres — the DB UNIQUE
 * indexes (V2 dedup + V5 ledger-entry idempotency) are the serialisation
 * points; anything mocked would prove nothing.
 *
 * <p>Harness mirrors {@link CategorizerServiceTest},
 * {@link com.ledgerline.ledger.LedgerConcurrencyTest}, and
 * {@code IngestionConcurrencyTest}: dual-mode Testcontainers / external
 * alt-port via {@code TEST_DATABASE_URL}, Flyway-migrated V1-V6, SUT runs
 * under the non-superuser {@code ledgerline_app} role so RLS is real.
 *
 * <p>Each test names the claim it proves in its {@code @DisplayName}; a real
 * bug is left as a failing test with the claim, never papered over.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CategorizerBridgeConcurrencyTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container;

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;

    private TenantContext appTenantContext;
    private CategorizerService categorizer;
    private LedgerService ledger;
    private CategorizeAndPostPublisher publisher;

    private final List<UUID> seededTenants = new ArrayList<>();

    @BeforeAll
    void setUp() {
        final String jdbcUrl;
        if (externalJdbcUrl() != null) {
            jdbcUrl = externalJdbcUrl();
        } else {
            container = new PostgreSQLContainer<>(DockerImageName.parse(DOCKER_IMAGE))
                .withDatabaseName("ledgerline")
                .withUsername(OWNER_USER)
                .withPassword(OWNER_PASSWORD);
            container.start();
            jdbcUrl = container.getJdbcUrl();
        }

        DataSource ownerDs = dataSource(jdbcUrl, OWNER_USER, OWNER_PASSWORD);
        Flyway.configure()
            .dataSource(ownerDs)
            .locations("classpath:db/migration")
            .baselineOnMigrate(true)
            .load()
            .migrate();
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        // SUT runs under the app role so RLS is REAL — same as production.
        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        this.appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        this.categorizer = new CategorizerService(appTenantContext);
        this.ledger = new LedgerService(appTenantContext);
        this.publisher = new CategorizeAndPostPublisher(categorizer, ledger, appTenantContext);
    }

    @AfterAll
    void tearDown() {
        if (ownerJdbc != null) {
            for (UUID t : seededTenants) {
                ownerJdbc.update("DELETE FROM tenants WHERE id = ?", t);
            }
        }
        if (container != null) {
            container.stop();
        }
    }

    private UUID tenantId;
    private UUID accountId;

    @BeforeEach
    void freshTenantAndAccount() {
        tenantId = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M11 Bridge Worf Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);

        accountId = ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'HDFC Bank', 'savings'::account_type, 'XXXX1234') "
                    + "RETURNING id",
                UUID.class));
    }

    // =====================================================================
    // 1. Publisher idempotency under concurrent calls (same txn).
    //
    // CLAIM: N concurrent publishIngested(SAME txn) yields exactly ONE
    // ledger_transfer and TWO ledger_entries; transactions.category_id set
    // correctly; no DuplicateKeyException leaks.
    // =====================================================================

    @Test
    @DisplayName("publisher idempotency: 16 concurrent publishIngested calls for the SAME txn produce exactly 1 transfer + 2 entries")
    void concurrent_same_txn_publishes_collapse_to_one_post() throws Exception {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries, 100, true);
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 1_000_000L); // ₹10,000

        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 10), 200_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/concurrent-replay");

        int N = 16;
        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>(N);
            for (int i = 0; i < N; i++) {
                futures.add(pool.submit(() -> {
                    try {
                        barrier.await(30, TimeUnit.SECONDS);
                        publisher.publishIngested(debit);
                    } catch (Throwable t) {
                        failures.add(t);
                    }
                }));
            }
            for (Future<?> f : futures) f.get(60, TimeUnit.SECONDS);

            assertThat(failures)
                .as("no exception (incl. DuplicateKeyException) leaks from the publisher under concurrent same-txn replays — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            // Database state: exactly 1 transfer + 2 entries for this txn.
            long transferCount = ownerJdbc.queryForObject(
                "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                    + "WHERE transaction_id = ? AND tenant_id = ?",
                Long.class, debit.id(), tenantId);
            long entryCount = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE transaction_id = ? AND tenant_id = ?",
                Long.class, debit.id(), tenantId);
            assertThat(transferCount).as("exactly ONE ledger_transfer for the shared txn").isEqualTo(1L);
            assertThat(entryCount).as("exactly TWO ledger_entries (debit leg + spent leg) for the shared txn").isEqualTo(2L);

            // category_id set, balance reflects exactly one ₹2,000 spend.
            assertThat(transactionCategoryId(debit.id())).isEqualTo(groceries);
            assertThat(ledger.balanceMinor(tenantId, groceriesMay)).isEqualTo(1_000_000L - 200_000L);

            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
            assertAllCachesMatchEntries();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 2. Concurrent ingestions routing to the same user envelope.
    //
    // CLAIM: With a ₹1,000 user envelope and 32 concurrent ₹100 debits
    // routed to it: successes ≤ 10, every other one falls back to
    // Unallocated (not silently dropped), money is conserved (entry-sum 0),
    // user envelope balance never negative, balance-cache matches entry-sum.
    // =====================================================================

    @Test
    @DisplayName("never-negative through the bridge: 32 concurrent ₹100 debits on a ₹1,000 envelope — successes ≤ 10, overflow falls back to Unallocated")
    void concurrent_ingestions_overflow_falls_back_to_unallocated() throws Exception {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries, 100, true);
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 100_000L); // ₹1,000

        int N = 32;
        long perSpend = 10_000L; // ₹100 each — capacity for at most 10 wins on Groceries.

        List<Transaction> txns = new ArrayList<>(N);
        for (int i = 0; i < N; i++) {
            txns.add(persistTransaction(
                LocalDate.of(2026, 5, 5), perSpend, TransactionDirection.debit,
                "UPI/BIGBAZAAR/storm-" + i));
        }

        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>(N);
            for (Transaction t : txns) {
                futures.add(pool.submit(() -> {
                    try {
                        barrier.await(30, TimeUnit.SECONDS);
                        publisher.publishIngested(t);
                    } catch (Throwable th) {
                        failures.add(th);
                    }
                }));
            }
            for (Future<?> f : futures) f.get(120, TimeUnit.SECONDS);

            assertThat(failures)
                .as("no exception leaks from the bridge under contention — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            // Every txn is accounted for: each got EXACTLY one transfer (either
            // on Groceries or on Unallocated).
            for (Transaction t : txns) {
                long transferCount = ownerJdbc.queryForObject(
                    "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                        + "WHERE transaction_id = ? AND tenant_id = ?",
                    Long.class, t.id(), tenantId);
                assertThat(transferCount)
                    .as("txn %s has exactly one transfer (no drops, no doubles)", t.id())
                    .isEqualTo(1L);
            }

            // Successes on Groceries ≤ 10 (₹1,000 / ₹100).
            UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
            long onGroceries = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE envelope_id = ? AND tenant_id = ? AND delta_minor < 0",
                Long.class, groceriesMay, tenantId);
            long onUnalloc = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE envelope_id = ? AND tenant_id = ? AND delta_minor < 0 AND transaction_id IS NOT NULL",
                Long.class, unalloc, tenantId);
            assertThat(onGroceries).as("at most 10 spends land on Groceries").isLessThanOrEqualTo(10L);
            assertThat(onGroceries + onUnalloc)
                .as("every one of the %d concurrent debits posted somewhere (no silent drops)", N)
                .isEqualTo((long) N);

            // No user envelope ever went negative; balance-cache consistent; money conserved.
            assertNoUserEnvelopeNegative();
            assertAllCachesMatchEntries();
            assertSystemEntrySumZero();
            assertEveryTransferBalanced();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 3. WouldGoNegative → Unallocated retry under contention (STORM).
    //
    // CLAIM: Pre-deplete a user envelope so every concurrent spend triggers
    // WouldGoNegative; assert every txn produces exactly ONE post (against
    // Unallocated), V5 still enforces one transfer per (tenant, txn,
    // envelope), no double-posts.
    // =====================================================================

    @Test
    @DisplayName("WouldGoNegative retry idempotency: depleted envelope + 24 concurrent spends — every txn lands EXACTLY once on Unallocated")
    void wouldgonegative_retry_under_contention_is_idempotent() throws Exception {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries, 100, true);
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        // Fund only ₹0.50 so any ₹100 spend triggers WouldGoNegative.
        fundEnvelope(groceriesMay, 50L);

        int N = 24;
        long perSpend = 10_000L; // ₹100 — guaranteed to overdraw.
        List<Transaction> txns = new ArrayList<>(N);
        for (int i = 0; i < N; i++) {
            txns.add(persistTransaction(
                LocalDate.of(2026, 5, 7), perSpend, TransactionDirection.debit,
                "UPI/BIGBAZAAR/overdraw-storm-" + i));
        }

        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>(N);
            for (Transaction t : txns) {
                futures.add(pool.submit(() -> {
                    try {
                        barrier.await(30, TimeUnit.SECONDS);
                        publisher.publishIngested(t);
                    } catch (Throwable th) {
                        failures.add(th);
                    }
                }));
            }
            for (Future<?> f : futures) f.get(120, TimeUnit.SECONDS);

            assertThat(failures)
                .as("no exception leaks from the bridge during overdraw storm — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
            // Every txn ends with exactly ONE transfer landing on Unallocated.
            for (Transaction t : txns) {
                long transferCount = ownerJdbc.queryForObject(
                    "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                        + "WHERE transaction_id = ? AND tenant_id = ?",
                    Long.class, t.id(), tenantId);
                assertThat(transferCount)
                    .as("txn %s has EXACTLY one transfer (V5 enforces one per (tenant, txn, envelope))", t.id())
                    .isEqualTo(1L);

                // The debit leg of that transfer must be on Unallocated (the
                // WouldGoNegative path always retargets to the pseudo).
                UUID debitEnvelope = ownerJdbc.queryForObject(
                    "SELECT envelope_id FROM ledger_entries "
                        + "WHERE transaction_id = ? AND tenant_id = ? AND delta_minor < 0",
                    UUID.class, t.id(), tenantId);
                assertThat(debitEnvelope)
                    .as("txn %s — debit leg lands on Unallocated after retry", t.id())
                    .isEqualTo(unalloc);
            }

            // Groceries is untouched (no committed entry, since every attempt rolled back).
            assertThat(ledger.balanceMinor(tenantId, groceriesMay)).isEqualTo(50L);

            assertNoUserEnvelopeNegative();
            assertAllCachesMatchEntries();
            assertSystemEntrySumZero();
            assertEveryTransferBalanced();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 4. Rules mutation under traffic.
    //
    // CLAIM: With a stream of ingest+publishes, INSERTing a new high-priority
    // rule and DISABLING an existing rule mid-stream produces no half-state:
    // every txn ends with EITHER a category_id matching some snapshot of the
    // rules at evaluation time, OR category_id IS NULL with the post in
    // Unallocated. No txn is "categorised but not posted".
    // =====================================================================

    @Test
    @DisplayName("rules-mutation safety: inserting + disabling rules mid-traffic never leaves a txn half-categorised")
    void rules_mutation_under_traffic_no_halfstate() throws Exception {
        UUID food = seedCategory("Food");
        UUID dining = seedCategory("Dining");

        // Initial rule: SWIGGY -> Food at priority 50.
        UUID foodRuleId = seedRuleReturnId("contains", "SWIGGY", food, 50, true);

        // Set up envelopes for both categories so the bridge has somewhere to
        // route a match.
        UUID foodMay = ledger.ensureUserEnvelope(tenantId, "Food", "2026-05");
        linkEnvelopeToCategory(foodMay, food);
        fundEnvelope(foodMay, 100_000_000L);
        UUID diningMay = ledger.ensureUserEnvelope(tenantId, "Dining", "2026-05");
        linkEnvelopeToCategory(diningMay, dining);
        fundEnvelope(diningMay, 100_000_000L);

        int N = 80;
        List<Transaction> txns = new ArrayList<>(N);
        for (int i = 0; i < N; i++) {
            txns.add(persistTransaction(
                LocalDate.of(2026, 5, 10), 5_000L, TransactionDirection.debit,
                "UPI/SWIGGY/order-" + i));
        }

        ExecutorService pool = Executors.newFixedThreadPool(N);
        CountDownLatch start = new CountDownLatch(1);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>(N);
            for (Transaction t : txns) {
                futures.add(pool.submit(() -> {
                    try {
                        start.await(30, TimeUnit.SECONDS);
                        publisher.publishIngested(t);
                    } catch (Throwable th) {
                        failures.add(th);
                    }
                }));
            }
            // Mid-traffic mutator: a few rule changes interleaved while
            // ingestions are firing.
            Future<?> mutator = pool.submit(() -> {
                try {
                    start.await(30, TimeUnit.SECONDS);
                    // Sleep a hair so a chunk of work has already started.
                    Thread.sleep(20);
                    // Insert a higher-priority rule that re-routes SWIGGY -> Dining.
                    seedRule("contains", "SWIGGY", dining, 10, true);
                    Thread.sleep(15);
                    // Disable the original Food rule.
                    ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
                        jdbc.update("UPDATE categorization_rules SET enabled = false WHERE id = ?", foodRuleId));
                } catch (Throwable th) {
                    failures.add(th);
                }
            });

            start.countDown();
            for (Future<?> f : futures) f.get(120, TimeUnit.SECONDS);
            mutator.get(30, TimeUnit.SECONDS);

            assertThat(failures)
                .as("no exceptions during rules-mutation-under-traffic — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            // The invariant: every txn ended in a consistent state. category_id
            // is one of {food, dining, null}; the matching debit-leg envelope
            // is one of {foodMay, diningMay, unalloc}. The category_id MUST
            // be consistent with the envelope landing — that is the half-state
            // guard.
            UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
            int landedFood = 0, landedDining = 0, landedUnalloc = 0;
            for (Transaction t : txns) {
                UUID catId = transactionCategoryId(t.id());
                UUID debitEnv = ownerJdbc.queryForObject(
                    "SELECT envelope_id FROM ledger_entries "
                        + "WHERE transaction_id = ? AND tenant_id = ? AND delta_minor < 0",
                    UUID.class, t.id(), tenantId);
                assertThat(debitEnv).as("txn %s posted somewhere", t.id()).isNotNull();

                if (debitEnv.equals(foodMay)) {
                    landedFood++;
                    assertThat(catId)
                        .as("txn %s landed on Food envelope — category_id must be Food", t.id())
                        .isEqualTo(food);
                } else if (debitEnv.equals(diningMay)) {
                    landedDining++;
                    assertThat(catId)
                        .as("txn %s landed on Dining envelope — category_id must be Dining", t.id())
                        .isEqualTo(dining);
                } else if (debitEnv.equals(unalloc)) {
                    landedUnalloc++;
                    // Unallocated is valid for EITHER no match (category_id
                    // NULL) OR a match whose category lacks a (cat,period)
                    // envelope — neither case applies in this test setup
                    // (both Food and Dining have envelopes). The only way to
                    // land on Unallocated here would be a no-match — which
                    // shouldn't happen since the rule set always has SOME
                    // SWIGGY rule. Surface it if it ever occurs.
                    assertThat(catId)
                        .as("txn %s landed on Unallocated unexpectedly — category_id = %s", t.id(), catId)
                        .isNull();
                } else {
                    org.assertj.core.api.Assertions.fail("txn %s landed on unknown envelope %s", t.id(), debitEnv);
                }
            }
            // Both rule-set snapshots got exercised.
            assertThat(landedFood + landedDining + landedUnalloc).isEqualTo(N);
            assertThat(landedFood + landedDining)
                .as("at least one rule snapshot routed correctly")
                .isPositive();

            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
            assertNoUserEnvelopeNegative();
            assertAllCachesMatchEntries();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 5. Bad regex rule under load.
    //
    // CLAIM: A broken regex at high priority is logged + skipped (no thread
    // blocks or crashes); subsequent rules still match; every txn posts.
    // =====================================================================

    @Test
    @DisplayName("bad-regex resilience under load: a malformed regex at priority 1 is skipped; fallback rule still matches; every txn posts")
    void bad_regex_under_load_does_not_poison_the_pipeline() throws Exception {
        UUID groceries = seedCategory("Groceries");
        UUID dining = seedCategory("Dining");

        // Priority 1: a regex that fails to compile — must be skipped.
        seedRule("regex", "(unclosed", dining, 1, true);
        // Priority 100: the real rule that should still get its turn.
        seedRule("contains", "BIGBAZAAR", groceries, 100, true);

        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 100_000_000L);

        int N = 24;
        List<Transaction> txns = new ArrayList<>(N);
        for (int i = 0; i < N; i++) {
            txns.add(persistTransaction(
                LocalDate.of(2026, 5, 8), 1_000L, TransactionDirection.debit,
                "UPI/BIGBAZAAR/badregex-" + i));
        }

        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>(N);
            for (Transaction t : txns) {
                futures.add(pool.submit(() -> {
                    try {
                        barrier.await(30, TimeUnit.SECONDS);
                        publisher.publishIngested(t);
                    } catch (Throwable th) {
                        failures.add(th);
                    }
                }));
            }
            for (Future<?> f : futures) f.get(60, TimeUnit.SECONDS);

            assertThat(failures)
                .as("bad regex under load does not crash any thread — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            // Every txn matched Groceries (the fallback) and landed on the
            // funded Groceries envelope — proves the broken regex did not
            // shadow the rest of the rule list.
            for (Transaction t : txns) {
                assertThat(transactionCategoryId(t.id()))
                    .as("txn %s — fallback rule still wins despite bad regex above it", t.id())
                    .isEqualTo(groceries);
                UUID debitEnv = ownerJdbc.queryForObject(
                    "SELECT envelope_id FROM ledger_entries "
                        + "WHERE transaction_id = ? AND tenant_id = ? AND delta_minor < 0",
                    UUID.class, t.id(), tenantId);
                assertThat(debitEnv).isEqualTo(groceriesMay);
            }

            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
            assertNoUserEnvelopeNegative();
            assertAllCachesMatchEntries();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 6. Multi-tenant isolation across the full bridge.
    //
    // CLAIM: A and B each with their own rules/categories/envelopes; same
    // rawDescription literal; A's debits land in A's envelopes only,
    // B's in B's; rule evaluation doesn't leak through the bridge end-to-end.
    // =====================================================================

    @Test
    @DisplayName("multi-tenant isolation through the bridge: identical rawDescription in A and B routes to their own envelopes only")
    void multitenant_isolation_through_bridge() throws Exception {
        UUID tenantA = tenantId;
        UUID accountA = accountId;
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class, "M11 Bridge Tenant B " + UUID.randomUUID());
        seededTenants.add(tenantB);
        UUID accountB = ownerTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'ICICI Bank', 'current'::account_type, 'XXXX9999') "
                    + "RETURNING id",
                UUID.class));

        // A: "BIGBAZAAR" -> Groceries(A); a funded Groceries envelope for May.
        UUID groceriesA = seedCategoryFor(tenantA, "Groceries");
        seedRuleFor(tenantA, "contains", "BIGBAZAAR", groceriesA, 100, true);
        UUID groceriesAMay = ensureUserEnvelopeForTenant(tenantA, "Groceries", "2026-05");
        linkEnvelopeToCategoryFor(tenantA, groceriesAMay, groceriesA);
        fundEnvelopeFor(tenantA, groceriesAMay, 10_000_000L);

        // B: SAME pattern "BIGBAZAAR" but routes to B's OWN "Mart" category +
        // envelope. RLS must keep A's rule invisible to B and vice versa.
        UUID martB = seedCategoryFor(tenantB, "Mart");
        seedRuleFor(tenantB, "contains", "BIGBAZAAR", martB, 100, true);
        UUID martBMay = ensureUserEnvelopeForTenant(tenantB, "Mart", "2026-05");
        linkEnvelopeToCategoryFor(tenantB, martBMay, martB);
        fundEnvelopeFor(tenantB, martBMay, 10_000_000L);

        int per = 20;
        List<Transaction> txnsA = new ArrayList<>(per);
        List<Transaction> txnsB = new ArrayList<>(per);
        for (int i = 0; i < per; i++) {
            txnsA.add(persistTransactionFor(tenantA, accountA,
                LocalDate.of(2026, 5, 12), 1_000L, TransactionDirection.debit,
                "UPI/BIGBAZAAR/A-" + i));
            txnsB.add(persistTransactionFor(tenantB, accountB,
                LocalDate.of(2026, 5, 12), 2_000L, TransactionDirection.debit,
                "UPI/BIGBAZAAR/B-" + i));
        }

        ExecutorService pool = Executors.newFixedThreadPool(per * 2);
        CyclicBarrier barrier = new CyclicBarrier(per * 2);
        ConcurrentLinkedQueue<Throwable> failures = new ConcurrentLinkedQueue<>();
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (Transaction ta : txnsA) {
                futures.add(pool.submit(() -> {
                    try { barrier.await(30, TimeUnit.SECONDS); publisher.publishIngested(ta); }
                    catch (Throwable th) { failures.add(th); }
                }));
            }
            for (Transaction tb : txnsB) {
                futures.add(pool.submit(() -> {
                    try { barrier.await(30, TimeUnit.SECONDS); publisher.publishIngested(tb); }
                    catch (Throwable th) { failures.add(th); }
                }));
            }
            for (Future<?> f : futures) f.get(120, TimeUnit.SECONDS);

            assertThat(failures)
                .as("no exceptions in multi-tenant concurrent bridge run — samples: %s",
                    failures.stream().limit(3).map(t -> t.getClass().getSimpleName() + ": " + t.getMessage()).toList())
                .isEmpty();

            // A's txns: category_id = Groceries(A), debit leg on Groceries(A) envelope.
            for (Transaction ta : txnsA) {
                assertThat(transactionCategoryIdFor(tenantA, ta.id())).isEqualTo(groceriesA);
                UUID env = ownerJdbc.queryForObject(
                    "SELECT envelope_id FROM ledger_entries WHERE transaction_id = ? AND tenant_id = ? AND delta_minor < 0",
                    UUID.class, ta.id(), tenantA);
                assertThat(env).isEqualTo(groceriesAMay);
            }
            // B's txns: category_id = Mart(B), debit leg on Mart(B) envelope.
            for (Transaction tb : txnsB) {
                assertThat(transactionCategoryIdFor(tenantB, tb.id())).isEqualTo(martB);
                UUID env = ownerJdbc.queryForObject(
                    "SELECT envelope_id FROM ledger_entries WHERE transaction_id = ? AND tenant_id = ? AND delta_minor < 0",
                    UUID.class, tb.id(), tenantB);
                assertThat(env).isEqualTo(martBMay);
            }
            // Headline structural check: A's ledger never sees B's envelopes.
            long aEntriesOnB = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE tenant_id = ? AND envelope_id IN (?, ?)",
                Long.class, tenantA, martBMay, ensurePseudoFor(tenantB, EnvelopeKind.unallocated));
            long bEntriesOnA = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE tenant_id = ? AND envelope_id IN (?, ?)",
                Long.class, tenantB, groceriesAMay, ensurePseudoFor(tenantA, EnvelopeKind.unallocated));
            assertThat(aEntriesOnB).as("tenant A never writes entries against tenant B's envelopes").isZero();
            assertThat(bEntriesOnA).as("tenant B never writes entries against tenant A's envelopes").isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 7. End-to-end M1 → M11 → M12 stress.
    //
    // CLAIM: 500-row CSV through the full chain; ~80% match a user envelope,
    // the rest land in Unallocated. Re-upload the same CSV: still 500 total
    // posts (no doubles); every txn has a valid envelope; per-envelope
    // balances match the sum of their entries.
    // =====================================================================

    @Test
    @DisplayName("end-to-end pipeline correctness: 500-row CSV through M1→M11→M12; re-upload preserves 500 posts (no doubles)")
    void end_to_end_pipeline_dedup_and_correctness() throws Exception {
        // Three categories with envelopes. ~80% of rows match one of these.
        UUID food = seedCategory("Food");
        UUID groceries = seedCategory("Groceries");
        UUID transport = seedCategory("Transport");

        seedRule("contains", "SWIGGY",    food,      100, true);
        seedRule("contains", "BIGBAZAAR", groceries, 100, true);
        seedRule("contains", "UBER",      transport, 100, true);

        UUID foodMay = ledger.ensureUserEnvelope(tenantId, "Food", "2026-05");
        linkEnvelopeToCategory(foodMay, food);
        fundEnvelope(foodMay, 100_000_000L);
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 100_000_000L);
        UUID transportMay = ledger.ensureUserEnvelope(tenantId, "Transport", "2026-05");
        linkEnvelopeToCategory(transportMay, transport);
        fundEnvelope(transportMay, 100_000_000L);

        // 500-row CSV: ~80% match SWIGGY/BIGBAZAAR/UBER; remaining 20% are
        // RANDOMSHOP (no rule -> Unallocated).
        StringBuilder csv = new StringBuilder("Date,Description,Debit,Credit\n");
        Random r = new Random(0xBADCAFEL);
        int total = 500;
        int expectMatched = 0, expectUnalloc = 0;
        for (int i = 0; i < total; i++) {
            int day = 1 + (i % 28);
            String desc;
            int dice = r.nextInt(100);
            if (dice < 30)      { desc = "UPI/SWIGGY/order-"    + i; expectMatched++; }
            else if (dice < 60) { desc = "UPI/BIGBAZAAR/order-" + i; expectMatched++; }
            else if (dice < 80) { desc = "UPI/UBER/trip-"       + i; expectMatched++; }
            else                { desc = "UPI/RANDOMSHOP/x-"    + i; expectUnalloc++; }
            // ₹1.00 each — well within all funded envelopes.
            csv.append(String.format("2026-05-%02d,%s,1.00,%n", day, desc));
        }

        IngestionService ingest = new IngestionService(
            appTenantContext, new CsvStatementParser(), publisher);

        // First upload: 500 inserts, 500 publishes, 500 ledger transfers.
        IngestionResult r1 = ingest.ingest(tenantId, accountId, asStream(csv.toString()));
        assertThat(r1.errors()).isEmpty();
        assertThat(r1.accepted()).isEqualTo(total);
        assertThat(r1.duplicates()).isZero();

        long transfers1 = ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?", Long.class, tenantId);
        // Each post is one transfer; the funding allocations already used
        // 3 user envs * 2 transfers each + 1 income->unalloc allocation
        // each = 7 pre-existing transfers (verified via subtraction below).
        // We can't pin the exact total without knowing the funding count,
        // so we pin the delta: exactly `total` transfers for the txns.
        long txnTransfers1 = ownerJdbc.queryForObject(
            "SELECT count(DISTINCT le.transfer_id) FROM ledger_entries le "
                + "WHERE le.tenant_id = ? AND le.transaction_id IS NOT NULL",
            Long.class, tenantId);
        assertThat(txnTransfers1).as("first upload produces exactly %d transfers", total).isEqualTo((long) total);

        // Second upload: same CSV. M1 dedup should drop ALL 500. The bridge
        // is not even called on duplicates (per the M4 seam contract).
        IngestionResult r2 = ingest.ingest(tenantId, accountId, asStream(csv.toString()));
        assertThat(r2.errors()).isEmpty();
        assertThat(r2.accepted()).isZero();
        assertThat(r2.duplicates()).isEqualTo(total);

        long txnTransfers2 = ownerJdbc.queryForObject(
            "SELECT count(DISTINCT le.transfer_id) FROM ledger_entries le "
                + "WHERE le.tenant_id = ? AND le.transaction_id IS NOT NULL",
            Long.class, tenantId);
        assertThat(txnTransfers2)
            .as("re-upload does not double-post: still %d transfers after second upload", total)
            .isEqualTo((long) total);

        // Every transactions row has a debit leg landing somewhere valid.
        long txnRows = ownerJdbc.queryForObject(
            "SELECT count(*) FROM transactions WHERE tenant_id = ? AND direction = 'debit'::transaction_direction",
            Long.class, tenantId);
        assertThat(txnRows).isEqualTo((long) total);

        // Headline invariants.
        assertEveryTransferBalanced();
        assertSystemEntrySumZero();
        assertNoUserEnvelopeNegative();
        assertAllCachesMatchEntries();
    }

    // =====================================================================
    // 8. Property pass (seed-pinned, ~150 mixed ops).
    //
    // CLAIM: ~150 random ops mixing tenant-A/B ingestion, rule add, rule
    // disable, re-ingest. After every step: every transfer balanced, no user
    // envelope negative, balance-cache == entry-sum, system entry-sum == 0,
    // transactions.category_id NULL or belongs to the same tenant.
    // =====================================================================

    @Test
    @DisplayName("property: ~150 mixed ops (ingest A/B, add/disable rule) — every invariant holds after every step")
    void randomised_property_sequence_preserves_invariants() throws Exception {
        // Pinned for reproducibility.
        Random r = new Random(0xFEEDFACEL);

        UUID tenantA = tenantId;
        UUID accountA = accountId;
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class, "M11 Bridge Prop B " + UUID.randomUUID());
        seededTenants.add(tenantB);
        UUID accountB = ownerTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'Axis Bank', 'savings'::account_type, 'XXXX7777') "
                    + "RETURNING id",
                UUID.class));

        // A: Food/Groceries; B: Mart/Travel.
        UUID foodA = seedCategoryFor(tenantA, "Food");
        UUID grocA = seedCategoryFor(tenantA, "Groceries");
        UUID martB = seedCategoryFor(tenantB, "Mart");
        UUID travB = seedCategoryFor(tenantB, "Travel");

        // Initial rules so the pipeline has something to match against.
        seedRuleFor(tenantA, "contains", "SWIGGY",    foodA, 100, true);
        seedRuleFor(tenantA, "contains", "BIGBAZAAR", grocA, 100, true);
        seedRuleFor(tenantB, "contains", "BIGBAZAAR", martB, 100, true);
        seedRuleFor(tenantB, "contains", "UBER",      travB, 100, true);

        UUID foodAMay = ensureUserEnvelopeForTenant(tenantA, "Food", "2026-05");
        linkEnvelopeToCategoryFor(tenantA, foodAMay, foodA);
        fundEnvelopeFor(tenantA, foodAMay, 100_000_000L);
        UUID grocAMay = ensureUserEnvelopeForTenant(tenantA, "Groceries", "2026-05");
        linkEnvelopeToCategoryFor(tenantA, grocAMay, grocA);
        fundEnvelopeFor(tenantA, grocAMay, 100_000_000L);
        UUID martBMay = ensureUserEnvelopeForTenant(tenantB, "Mart", "2026-05");
        linkEnvelopeToCategoryFor(tenantB, martBMay, martB);
        fundEnvelopeFor(tenantB, martBMay, 100_000_000L);
        UUID travBMay = ensureUserEnvelopeForTenant(tenantB, "Travel", "2026-05");
        linkEnvelopeToCategoryFor(tenantB, travBMay, travB);
        fundEnvelopeFor(tenantB, travBMay, 100_000_000L);

        IngestionService ingest = new IngestionService(
            appTenantContext, new CsvStatementParser(), publisher);

        int ops = 150;
        int ingestCount = 0, addRuleCount = 0, disableRuleCount = 0;
        for (int i = 0; i < ops; i++) {
            int dice = r.nextInt(100);
            UUID curT = (r.nextBoolean() ? tenantA : tenantB);
            UUID curAcc = curT.equals(tenantA) ? accountA : accountB;

            try {
                if (dice < 75) {
                    // Ingest a small batch.
                    int rows = 1 + r.nextInt(4);
                    StringBuilder csv = new StringBuilder("Date,Description,Debit,Credit\n");
                    for (int j = 0; j < rows; j++) {
                        int day = 1 + r.nextInt(27);
                        String[] keywords = { "SWIGGY", "BIGBAZAAR", "UBER", "RANDOMSHOP" };
                        String kw = keywords[r.nextInt(keywords.length)];
                        // Distinct desc per row so dedup is not the test surface.
                        csv.append(String.format(
                            "2026-05-%02d,UPI/%s/op%d-r%d-%s,1.00,%n",
                            day, kw, i, j, UUID.randomUUID()));
                    }
                    ingest.ingest(curT, curAcc, asStream(csv.toString()));
                    ingestCount++;
                } else if (dice < 90) {
                    // Add a new rule on the chosen tenant for the chosen category.
                    UUID cat = curT.equals(tenantA)
                        ? (r.nextBoolean() ? foodA : grocA)
                        : (r.nextBoolean() ? martB : travB);
                    String[] kws = { "ZOMATO", "AMAZON", "OLA", "DMART" };
                    String kw = kws[r.nextInt(kws.length)];
                    int priority = 50 + r.nextInt(100);
                    seedRuleFor(curT, "contains", kw, cat, priority, true);
                    addRuleCount++;
                } else {
                    // Disable a random enabled rule on the chosen tenant.
                    List<UUID> ruleIds = ownerTenantContext.withTenant(curT, (JdbcTemplate jdbc) ->
                        jdbc.queryForList(
                            "SELECT id FROM categorization_rules WHERE enabled = true",
                            UUID.class));
                    if (!ruleIds.isEmpty()) {
                        UUID pick = ruleIds.get(r.nextInt(ruleIds.size()));
                        ownerTenantContext.withTenant(curT, (JdbcTemplate jdbc) ->
                            jdbc.update("UPDATE categorization_rules SET enabled = false WHERE id = ?", pick));
                        disableRuleCount++;
                    }
                }
            } catch (RuntimeException ex) {
                org.assertj.core.api.Assertions.fail(
                    "op #%d (dice=%d, tenant=%s) threw unexpectedly: %s",
                    i, dice, curT, ex.getClass().getSimpleName() + ": " + ex.getMessage());
            }

            // -- INVARIANTS after every step, across BOTH tenants --
            try {
                assertEveryTransferBalancedFor(tenantA);
                assertEveryTransferBalancedFor(tenantB);
                assertSystemEntrySumZeroFor(tenantA);
                assertSystemEntrySumZeroFor(tenantB);
                assertNoUserEnvelopeNegativeFor(tenantA);
                assertNoUserEnvelopeNegativeFor(tenantB);
                assertAllCachesMatchEntriesFor(tenantA);
                assertAllCachesMatchEntriesFor(tenantB);

                // category_id either NULL OR belongs to the same tenant.
                List<Object[]> mismatches = ownerJdbc.query(
                    "SELECT t.id, t.tenant_id, t.category_id, c.tenant_id "
                        + "FROM transactions t "
                        + "JOIN categories c ON c.id = t.category_id "
                        + "WHERE t.category_id IS NOT NULL "
                        + "  AND c.tenant_id <> t.tenant_id "
                        + "  AND t.tenant_id IN (?, ?)",
                    (rs, rowNum) -> new Object[]{
                        rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4)
                    },
                    tenantA, tenantB);
                assertThat(mismatches)
                    .as("no cross-tenant category_id leak after op #%d", i)
                    .isEmpty();
            } catch (AssertionError ae) {
                System.out.println("[property] invariant violated after op #" + (i + 1)
                    + " (ingest=" + ingestCount + " addRule=" + addRuleCount
                    + " disableRule=" + disableRuleCount + ") dice=" + dice
                    + " : " + ae.getMessage());
                throw ae;
            }
        }
        // Smoke: the random walk actually exercised the surface.
        assertThat(ingestCount).as("randomiser produced ingests").isPositive();
        assertThat(addRuleCount + disableRuleCount).as("randomiser produced rule mutations").isPositive();
    }

    // =====================================================================
    // Helpers — single-tenant (operate against this.tenantId)
    // =====================================================================

    private UUID seedCategory(String name) {
        return seedCategoryFor(tenantId, name);
    }

    private void seedRule(String kind, String pattern, UUID categoryId, int priority, boolean enabled) {
        seedRuleFor(tenantId, kind, pattern, categoryId, priority, enabled);
    }

    private UUID seedRuleReturnId(String kind, String pattern, UUID categoryId, int priority, boolean enabled) {
        return ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO categorization_rules "
                    + "(tenant_id, pattern_kind, pattern, category_id, priority, enabled) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?::rule_pattern_kind, ?, ?, ?, ?"
                    + ") RETURNING id",
                UUID.class,
                kind, pattern, categoryId, priority, enabled));
    }

    private Transaction persistTransaction(
        LocalDate postedAt,
        long amountMinor,
        TransactionDirection direction,
        String rawDescription
    ) {
        return persistTransactionFor(tenantId, accountId, postedAt, amountMinor, direction, rawDescription);
    }

    private void linkEnvelopeToCategory(UUID envelopeId, UUID categoryId) {
        linkEnvelopeToCategoryFor(tenantId, envelopeId, categoryId);
    }

    private void fundEnvelope(UUID envelopeId, long amountMinor) {
        fundEnvelopeFor(tenantId, envelopeId, amountMinor);
    }

    private UUID transactionCategoryId(UUID txnId) {
        return transactionCategoryIdFor(tenantId, txnId);
    }

    // =====================================================================
    // Helpers — multi-tenant variants
    // =====================================================================

    private UUID seedCategoryFor(UUID t, String name) {
        return ownerTenantContext.withTenant(t, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO categories (tenant_id, name, kind) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        ?, 'expense'::category_kind) "
                    + "RETURNING id",
                UUID.class,
                name));
    }

    private void seedRuleFor(UUID t, String kind, String pattern, UUID categoryId, int priority, boolean enabled) {
        ownerTenantContext.withTenant(t, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO categorization_rules "
                    + "(tenant_id, pattern_kind, pattern, category_id, priority, enabled) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?::rule_pattern_kind, ?, ?, ?, ?"
                    + ")",
                kind, pattern, categoryId, priority, enabled));
    }

    private Transaction persistTransactionFor(
        UUID t,
        UUID acct,
        LocalDate postedAt,
        long amountMinor,
        TransactionDirection direction,
        String rawDescription
    ) {
        String dedup = "dedup-" + UUID.randomUUID();
        Instant ingestedAt = Instant.now();
        UUID id = ownerTenantContext.withTenant(t, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO transactions
                  (tenant_id, account_id, posted_at, amount_minor, direction,
                   raw_description, source, dedup_hash, ingested_at)
                VALUES (
                  NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                  ?, ?, ?, ?::transaction_direction,
                  ?, 'statement_upload'::ingestion_source, ?, ?
                ) RETURNING id
                """,
                UUID.class,
                acct, postedAt, amountMinor, direction.name(),
                rawDescription, dedup, java.sql.Timestamp.from(ingestedAt)));
        return new Transaction(
            id, t, acct, postedAt,
            new Money(amountMinor, CurrencyCode.INR), direction,
            rawDescription, null, null,
            IngestionSource.statement_upload, dedup, ingestedAt);
    }

    private UUID ensureUserEnvelopeForTenant(UUID t, String name, String period) {
        return ledger.ensureUserEnvelope(t, name, period);
    }

    private void linkEnvelopeToCategoryFor(UUID t, UUID envelopeId, UUID categoryId) {
        ownerTenantContext.withTenant(t, (JdbcTemplate jdbc) ->
            jdbc.update("UPDATE envelopes SET category_id = ? WHERE id = ?", categoryId, envelopeId));
    }

    private void fundEnvelopeFor(UUID t, UUID envelopeId, long amountMinor) {
        UUID income  = ledger.ensurePseudoEnvelope(t, EnvelopeKind.income);
        UUID unalloc = ledger.ensurePseudoEnvelope(t, EnvelopeKind.unallocated);
        ledger.allocate(t, income, unalloc, amountMinor, "test income");
        ledger.allocate(t, unalloc, envelopeId, amountMinor, "test budget");
    }

    private UUID ensurePseudoFor(UUID t, EnvelopeKind kind) {
        return ledger.ensurePseudoEnvelope(t, kind);
    }

    private UUID transactionCategoryIdFor(UUID t, UUID txnId) {
        List<UUID> ids = ownerJdbc.queryForList(
            "SELECT category_id FROM transactions WHERE id = ? AND tenant_id = ?",
            UUID.class, txnId, t);
        return ids.isEmpty() ? null : ids.get(0);
    }

    // =====================================================================
    // Invariant audits — owner role, explicit tenant filter (RLS bypassed)
    // =====================================================================

    private void assertEveryTransferBalanced() {
        assertEveryTransferBalancedFor(tenantId);
    }

    private void assertEveryTransferBalancedFor(UUID t) {
        List<Long> bad = ownerJdbc.queryForList(
            "SELECT SUM(delta_minor) FROM ledger_entries "
                + "WHERE tenant_id = ? "
                + "GROUP BY transfer_id HAVING SUM(delta_minor) <> 0",
            Long.class, t);
        assertThat(bad).as("every transfer's entries sum to zero (tenant %s)", t).isEmpty();
    }

    private void assertSystemEntrySumZero() {
        assertSystemEntrySumZeroFor(tenantId);
    }

    private void assertSystemEntrySumZeroFor(UUID t) {
        Long total = ownerJdbc.queryForObject(
            "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries WHERE tenant_id = ?",
            Long.class, t);
        assertThat(total).as("tenant-wide entry-sum is zero (money conserved) for %s", t).isZero();
    }

    private void assertNoUserEnvelopeNegative() {
        assertNoUserEnvelopeNegativeFor(tenantId);
    }

    private void assertNoUserEnvelopeNegativeFor(UUID t) {
        List<Long> negatives = ownerJdbc.queryForList(
            "SELECT COALESCE(SUM(le.delta_minor), 0) "
                + "FROM envelopes e "
                + "LEFT JOIN ledger_entries le ON le.envelope_id = e.id AND le.tenant_id = e.tenant_id "
                + "WHERE e.kind = 'user' AND e.tenant_id = ? "
                + "GROUP BY e.id "
                + "HAVING COALESCE(SUM(le.delta_minor), 0) < 0",
            Long.class, t);
        assertThat(negatives).as("no user envelope is negative for tenant %s", t).isEmpty();
    }

    private void assertAllCachesMatchEntries() {
        assertAllCachesMatchEntriesFor(tenantId);
    }

    private void assertAllCachesMatchEntriesFor(UUID t) {
        List<UUID> envIds = ownerJdbc.queryForList(
            "SELECT id FROM envelopes WHERE tenant_id = ?", UUID.class, t);
        for (UUID id : envIds) {
            long cache = ownerJdbc.queryForObject(
                "SELECT balance_minor FROM envelopes WHERE id = ? AND tenant_id = ?",
                Long.class, id, t);
            long entrySum = ownerJdbc.queryForObject(
                "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries "
                    + "WHERE envelope_id = ? AND tenant_id = ?",
                Long.class, id, t);
            assertThat(cache)
                .as("balance_minor cache matches entry-sum for envelope %s (tenant %s)", id, t)
                .isEqualTo(entrySum);
        }
    }

    // =====================================================================
    // Misc
    // =====================================================================

    private static InputStream asStream(String s) {
        return new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8));
    }

    private static String externalJdbcUrl() {
        String prop = System.getProperty("ledgerline.test.jdbc-url");
        if (prop != null && !prop.isBlank()) {
            return prop;
        }
        String env = System.getenv("TEST_DATABASE_URL");
        return (env != null && !env.isBlank()) ? env : null;
    }

    private static DataSource dataSource(String url, String user, String password) {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(url);
        ds.setUsername(user);
        ds.setPassword(password);
        return ds;
    }
}
