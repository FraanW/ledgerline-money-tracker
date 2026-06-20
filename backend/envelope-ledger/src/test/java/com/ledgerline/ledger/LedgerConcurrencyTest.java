package com.ledgerline.ledger;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.platform.db.TenantContext;
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
import java.util.concurrent.atomic.AtomicInteger;
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
 * M12 — adversarial concurrency + invariant suite for {@link LedgerService}.
 *
 * <p>This is Worf's battery. Where {@link LedgerServiceTest} proves the happy
 * path holds in isolation, this class proves the four ledger invariants hold
 * under contention: <b>never-negative</b>, <b>atomic transfer</b>,
 * <b>idempotency</b>, and <b>deadlock-freedom</b>, plus the structural
 * <b>pseudo-account uniqueness</b> rule from V4. Every test uses real OS
 * threads against a real Postgres — the {@code SELECT ... FOR UPDATE} lock
 * acquisition order is the design, so anything that mocks it out would prove
 * nothing.
 *
 * <p>Harness mirrors {@link LedgerServiceTest}: dual-mode Testcontainers /
 * external alt-port, fresh RLS-scoped tenant per test method, Flyway-migrated
 * V1-V4 schema. Each test names the claim it proves in {@code @DisplayName}.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LedgerConcurrencyTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    // Non-superuser app role created by migration V1. The LedgerService runs
    // under this role so that RLS is actually enforced — a superuser owner
    // would silently bypass it and (a) hide cross-tenant leaks in test infra
    // and, more importantly, (b) defeat the PseudoAccountResolver's tenant
    // scoping which depends on RLS to pick THIS tenant's spent/income row.
    // Running under the app role is the faithful production semantic.
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container;

    private DataSource ownerDs;
    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext; // for seeding fixtures (tenant rows, accounts)
    private LedgerService ledger;             // runs under the app role / app TenantContext

    private UUID tenantId;
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

        this.ownerDs = dataSource(jdbcUrl, OWNER_USER, OWNER_PASSWORD);
        Flyway.configure()
            .dataSource(ownerDs)
            .locations("classpath:db/migration")
            .baselineOnMigrate(true)
            .load()
            .migrate();
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        // The LedgerService runs under the non-superuser app role so that RLS
        // is REAL during the race. This is what production looks like.
        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        TenantContext appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        this.ledger = new LedgerService(appTenantContext);
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

    @BeforeEach
    void freshTenant() {
        tenantId = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M12 Concurrency Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);
    }

    // =====================================================================
    // 1. Two-spend race — the canonical never-negative case.
    // =====================================================================

    @Test
    @DisplayName("never-negative: two simultaneous ₹200 spends on a ₹300 envelope — exactly one wins")
    void two_spend_race_lets_exactly_one_through() throws Exception {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        seedBudget(groceries, 30_000L); // ₹300 = 30,000 paise

        UUID txn1 = seedFakeTransaction();
        UUID txn2 = seedFakeTransaction();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);
        try {
            Future<RaceOutcome> f1 = pool.submit(() ->
                attemptSpend(barrier, txn1, groceries, 20_000L));
            Future<RaceOutcome> f2 = pool.submit(() ->
                attemptSpend(barrier, txn2, groceries, 20_000L));

            RaceOutcome o1 = f1.get(30, TimeUnit.SECONDS);
            RaceOutcome o2 = f2.get(30, TimeUnit.SECONDS);

            // Exactly one success, exactly one WouldGoNegative.
            long successes = (o1.transferId != null ? 1 : 0) + (o2.transferId != null ? 1 : 0);
            long failures  = (o1.failedWithNegative ? 1 : 0) + (o2.failedWithNegative ? 1 : 0);
            assertThat(successes).as("exactly one spend wins").isEqualTo(1L);
            assertThat(failures).as("exactly one spend rejected as WouldGoNegative").isEqualTo(1L);

            // Surviving balance is ₹100 = 10_000 paise.
            assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(10_000L);

            // Balance cache matches entry-sum (denorm cache consistent).
            assertCacheMatchesEntries(groceries);

            // System total entries still sum to zero (money conserved).
            assertSystemEntrySumZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 2. N-way overspend storm — 32 concurrent ₹100 spends on a ₹1,000 envelope.
    // =====================================================================

    /**
     * 32-way storm. The strict claim: at most 10 spends succeed, no envelope
     * ever negative, every transfer balanced, balance-cache matches entry-sum.
     *
     * <p><b>Known finding (Worf):</b> under heavy first-touch races, this test
     * intermittently hits Postgres-detected deadlocks on
     * {@code SELECT ... FOR UPDATE} of the {@code envelopes} table. The
     * deterministic ascending-UUID lock-acquisition order in M12 is correct in
     * isolation but the pseudo-account first-touch via
     * {@code PseudoAccountResolver.resolve(spent)} runs <i>before</i> that
     * ordered acquisition, and several threads racing the {@code INSERT ... ON
     * CONFLICT DO UPDATE} of the {@code spent} row can produce a lock graph
     * the engine resolves by aborting one side. The aborts surface as
     * {@code PessimisticLockingFailureException} — neither {@code WouldGoNegative}
     * nor a posted transfer. Money is still safe (rolled-back txns write
     * nothing, the surviving asserts hold), but the user-visible contract
     * "every spend either succeeds or is told its envelope is empty" is
     * weakened to "may also surface a transient retryable error". The
     * mitigation belongs in M12, not here: pre-touch the pseudo envelopes
     * once per tenant in setup, or move the resolver inside the sorted
     * FOR UPDATE block.
     */
    @Test
    @DisplayName("never-negative storm — surfaces deadlock-on-first-touch finding (see Javadoc)")
    void n_way_overspend_storm_caps_successes() throws Exception {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        seedBudget(groceries, 100_000L); // ₹1,000

        int N = 32;
        long spendMinor = 10_000L; // ₹100 each
        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);

        List<UUID> txnIds = new ArrayList<>(N);
        for (int i = 0; i < N; i++) txnIds.add(seedFakeTransaction());

        try {
            List<Future<RaceOutcome>> futures = new ArrayList<>(N);
            for (int i = 0; i < N; i++) {
                final UUID txn = txnIds.get(i);
                futures.add(pool.submit(() -> attemptSpend(barrier, txn, groceries, spendMinor)));
            }

            int successes = 0;
            int negatives  = 0;
            int unexpected = 0;
            List<String> unexpectedMessages = new ArrayList<>();
            for (Future<RaceOutcome> f : futures) {
                RaceOutcome o = f.get(60, TimeUnit.SECONDS);
                if (o.transferId != null) successes++;
                else if (o.failedWithNegative) negatives++;
                else {
                    unexpected++;
                    unexpectedMessages.add(o.unexpected != null
                        ? o.unexpected.getClass().getSimpleName() + ": " + o.unexpected.getMessage()
                        : "null");
                }
            }

            assertThat(unexpected)
                .as("no unexpected exception types from postSpend — samples: %s",
                    unexpectedMessages.stream().limit(3).toList())
                .isZero();
            assertThat(successes).as("at most 10 spends succeed (10 * ₹100 == ₹1,000)").isLessThanOrEqualTo(10);
            assertThat(successes + negatives).as("every thread either succeeded or got WouldGoNegative")
                .isEqualTo(N);

            // Final balance == ₹1,000 - successes * ₹100; never negative.
            long expected = 100_000L - (successes * spendMinor);
            assertThat(expected).as("derived expectation cannot be negative").isGreaterThanOrEqualTo(0L);
            assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(expected);

            assertCacheMatchesEntries(groceries);
            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 3. Idempotency under concurrency — N threads, same transactionId.
    // =====================================================================

    /**
     * Idempotency claim: N concurrent {@code postSpend} calls with the same
     * {@code transactionId} should yield exactly ONE transfer + TWO entries,
     * and every thread sees the same {@code transferId}.
     *
     * <p><b>Known finding (Worf):</b> {@code postSpend}'s idempotency guard is
     * a plain {@code SELECT ... LIMIT 1} on {@code ledger_entries.transaction_id}
     * with no UNIQUE constraint backing it. Under concurrent first-time
     * replays, every thread sees "no row yet" and all proceed to post — so a
     * single {@code transaction_id} ends up with multiple {@code transfer_id}s
     * in {@code ledger_entries}. The replay-after-the-first-commit case
     * (Geordi's existing sequential test) DOES hold; it is only the
     * concurrent first-touch that breaks.
     *
     * <p>Mitigation belongs in M12 (recommendation): add a partial
     * {@code UNIQUE} index on {@code ledger_entries(transaction_id)
     * WHERE transaction_id IS NOT NULL}, catch the resulting constraint
     * violation in {@code postSpend}, and re-read the existing
     * {@code transferId}. The current check is a TOCTOU window.
     */
    @Test
    @DisplayName("idempotency under concurrency — TOCTOU window on postSpend's idempotency check (see Javadoc)")
    void idempotent_postspend_under_concurrency() throws Exception {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        seedBudget(groceries, 100_000L); // ₹1,000

        UUID sharedTxn = seedFakeTransaction();
        int N = 16;
        long spendMinor = 10_000L;

        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        try {
            List<Future<RaceOutcome>> futures = new ArrayList<>(N);
            for (int i = 0; i < N; i++) {
                futures.add(pool.submit(() ->
                    attemptSpend(barrier, sharedTxn, groceries, spendMinor)));
            }

            Set<UUID> distinctTransferIds = new HashSet<>();
            int negatives = 0;
            int unexpected = 0;
            for (Future<RaceOutcome> f : futures) {
                RaceOutcome o = f.get(60, TimeUnit.SECONDS);
                if (o.transferId != null) distinctTransferIds.add(o.transferId);
                else if (o.failedWithNegative) negatives++;
                else unexpected++;
            }

            assertThat(unexpected).as("no unexpected exception from idempotent replays").isZero();
            assertThat(negatives).as("idempotent replay must not be reported as WouldGoNegative").isZero();
            assertThat(distinctTransferIds)
                .as("every thread sees the SAME transferId for the shared transactionId")
                .hasSize(1);

            // The database itself must reflect exactly ONE transfer + TWO entries
            // for that transactionId. (Explicit tenant_id filter — owner bypasses RLS.)
            long transferRows = ownerJdbc.queryForObject(
                "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                    + "WHERE transaction_id = ? AND tenant_id = ?",
                Long.class, sharedTxn, tenantId);
            long entryRows = ownerJdbc.queryForObject(
                "SELECT count(*) FROM ledger_entries WHERE transaction_id = ? AND tenant_id = ?",
                Long.class, sharedTxn, tenantId);
            assertThat(transferRows).as("exactly one ledger_transfer for the shared txn").isEqualTo(1L);
            assertThat(entryRows).as("exactly two ledger_entries for the shared txn").isEqualTo(2L);

            // Balance reflects exactly ONE spend.
            assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(100_000L - spendMinor);

            assertCacheMatchesEntries(groceries);
            assertSystemEntrySumZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 4. Concurrent rollover vs spending in the source period.
    // =====================================================================

    /**
     * Concurrent-rollover-vs-spend is the design surface the brief flagged: per
     * ADR-0005 and {@link LedgerService#rollover}, rollover lists positive
     * balances in its own transaction, then for EACH source posts a separate
     * transfer in its own transaction. A spend that interleaves between the
     * list and the per-envelope move can leave the rollover move trying to
     * debit more than is now there — surfacing as a {@code WouldGoNegative}.
     *
     * <p>This test asserts the bigger guarantee: even when rollover throws
     * mid-flight, the ledger invariants HOLD — money is never lost, no user
     * envelope is driven negative, every transfer balances, and the
     * balance-cache matches the entry sum. Money conservation is the headline.
     *
     * <p>If rollover throws, the brief asked us to surface it: we capture and
     * report it as the documented design surface ("rollover is not
     * serialisation-isolated from concurrent spends in the source period"),
     * not a hard failure of M12's correctness floor.
     */
    @Test
    @DisplayName("rollover safety: spending against May while May->June rollover runs preserves money conservation")
    void concurrent_rollover_vs_spend_conserves_money() throws Exception {
        // Seed three May envelopes with healthy balances.
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID funMay       = ledger.ensureUserEnvelope(tenantId, "Fun",       "2026-05");
        UUID rentMay      = ledger.ensureUserEnvelope(tenantId, "Rent",      "2026-05");
        UUID income       = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc      = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        ledger.allocate(tenantId, income, unalloc, 10_000_000L, "salary");
        ledger.allocate(tenantId, unalloc, groceriesMay, 1_000_000L, "budget");
        ledger.allocate(tenantId, unalloc, funMay,         500_000L, "budget");
        ledger.allocate(tenantId, unalloc, rentMay,      2_000_000L, "budget");

        // Each spender will fire small (₹50) spends against May envelopes while
        // rollover is in flight. Each spend has a unique txnId.
        int spenderCount = 4;
        int spendsPerSpender = 20;
        long perSpend = 5_000L;
        ExecutorService pool = Executors.newFixedThreadPool(spenderCount + 1);

        // Pre-seed all the txn FK targets so we don't race transaction creation.
        UUID[][] txnGrid = new UUID[spenderCount][spendsPerSpender];
        for (int i = 0; i < spenderCount; i++) {
            for (int j = 0; j < spendsPerSpender; j++) {
                txnGrid[i][j] = seedFakeTransaction();
            }
        }

        UUID[] mayEnvelopes = { groceriesMay, funMay, rentMay };

        CountDownLatch start = new CountDownLatch(1);
        ConcurrentLinkedQueue<RaceOutcome> spendOutcomes = new ConcurrentLinkedQueue<>();
        try {
            // Spenders.
            for (int i = 0; i < spenderCount; i++) {
                final int spenderIdx = i;
                pool.submit(() -> {
                    start.await();
                    for (int j = 0; j < spendsPerSpender; j++) {
                        UUID target = mayEnvelopes[(spenderIdx + j) % mayEnvelopes.length];
                        spendOutcomes.add(attemptSpendNoBarrier(
                            txnGrid[spenderIdx][j], target, perSpend));
                        // Tiny jitter so rollover gets a chance to interleave.
                        Thread.sleep(1);
                    }
                    return null;
                });
            }
            // Rollover runner — capture any WouldGoNegative as documented design
            // surface, NOT as a test failure. The headline assertions below
            // (money conservation, no negatives, every transfer balanced) are
            // what proves the ledger floor still holds.
            Future<RaceOutcome> rolloverFuture = pool.submit(() -> {
                start.await();
                try {
                    ledger.rollover(tenantId, "2026-05", "2026-06");
                    return new RaceOutcome(UUID.randomUUID(), false, null);
                } catch (LedgerException.WouldGoNegative wgn) {
                    return new RaceOutcome(null, true, wgn);
                }
            });

            start.countDown();

            RaceOutcome rolloverOutcome = rolloverFuture.get(60, TimeUnit.SECONDS);
            pool.shutdown();
            assertThat(pool.awaitTermination(60, TimeUnit.SECONDS)).isTrue();

            if (rolloverOutcome.failedWithNegative) {
                // Surfacing the documented design surface — log it visibly so
                // the test report carries the signal even though the headline
                // invariants below still hold.
                System.out.println("[rollover-vs-spend] rollover threw WouldGoNegative — "
                    + "documented design surface per ADR-0005 + LedgerService.rollover: "
                    + "rollover runs each envelope-move in its OWN transaction, so a "
                    + "spend that interleaves between the list-balances and per-envelope "
                    + "move can leave the move trying to debit more than is now there. "
                    + "The all-or-nothing invariant still holds (only the partial "
                    + "rollover for the contended envelope was rejected), and the "
                    + "asserts below confirm money is still conserved.");
            }

            // -- Invariant 1: every entry in the system still sums to zero per transfer.
            assertEveryTransferBalanced();
            // -- Invariant 2: system-wide entry sum is zero (money conserved).
            assertSystemEntrySumZero();
            // -- Invariant 3: no user-kind envelope is negative anywhere, anywhere.
            assertNoUserEnvelopeNegative();
            // -- Invariant 4: balance cache matches entry-sum for EVERY envelope.
            assertAllCachesMatchEntries();

            // -- Headline conservation check: original budgeted total == sum of
            //    (all user envelope balances) + (spent pseudo) across both periods.
            long sumUserBalances = sumAllUserEnvelopeBalances();
            long spentBalance = ledger.balanceMinor(tenantId,
                ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.spent));
            long unallocBalance = ledger.balanceMinor(tenantId, unalloc);
            long incomeBalance = ledger.balanceMinor(tenantId, income);
            // unalloc + income + spent + all user envelopes (May+June) must sum to 0.
            long total = sumUserBalances + spentBalance + unallocBalance + incomeBalance;
            assertThat(total).as("the full ledger system sums to zero across all envelope kinds")
                .isZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 5. Deadlock-freedom soak — many transfers across cross-pairs.
    // =====================================================================

    @Test
    @DisplayName("deadlock-freedom: many concurrent allocate transfers across cross-pairs (A<->B, B<->C, C<->A) complete within timeout")
    void cross_pair_allocate_soak_does_not_deadlock() throws Exception {
        UUID income  = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        UUID a = ledger.ensureUserEnvelope(tenantId, "A", "2026-05");
        UUID b = ledger.ensureUserEnvelope(tenantId, "B", "2026-05");
        UUID c = ledger.ensureUserEnvelope(tenantId, "C", "2026-05");

        // Fund each envelope generously so never-negative is not the gating
        // factor here — we want to stress the LOCK ORDER, not the invariant.
        ledger.allocate(tenantId, income, unalloc, 30_000_000L, "salary");
        ledger.allocate(tenantId, unalloc, a, 10_000_000L, "budget");
        ledger.allocate(tenantId, unalloc, b, 10_000_000L, "budget");
        ledger.allocate(tenantId, unalloc, c, 10_000_000L, "budget");

        UUID[] envs = { a, b, c };
        int threads = 12;
        int opsPerThread = 25;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger errs = new AtomicInteger();
        try {
            for (int t = 0; t < threads; t++) {
                final int seed = t;
                pool.submit(() -> {
                    start.await();
                    Random r = new Random(seed);
                    for (int i = 0; i < opsPerThread; i++) {
                        int from = r.nextInt(envs.length);
                        int to;
                        do { to = r.nextInt(envs.length); } while (to == from);
                        long amount = 100L + r.nextInt(1_000);
                        try {
                            ledger.allocate(tenantId, envs[from], envs[to], amount, "soak");
                            ok.incrementAndGet();
                        } catch (RuntimeException ex) {
                            errs.incrementAndGet();
                        }
                    }
                    return null;
                });
            }
            start.countDown();
            pool.shutdown();
            // Generous bound; a deadlock would burn this and fail.
            boolean done = pool.awaitTermination(90, TimeUnit.SECONDS);
            assertThat(done).as("no deadlock — pool drained within 90s").isTrue();
            assertThat(errs.get()).as("no spurious failures from balanced transfers within funded envelopes")
                .isZero();
            assertThat(ok.get()).isEqualTo(threads * opsPerThread);

            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
            assertNoUserEnvelopeNegative();
            assertAllCachesMatchEntries();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 6. Atomic transfer under partial failure — never-negative on the SECOND
    //    envelope of a transfer must roll back the whole thing.
    // =====================================================================

    @Test
    @DisplayName("atomic transfer: a transfer that would drive its 'from' envelope negative writes NOTHING")
    void partial_failure_rolls_back_whole_transfer() {
        UUID a = ledger.ensureUserEnvelope(tenantId, "A", "2026-05");
        UUID b = ledger.ensureUserEnvelope(tenantId, "B", "2026-05");
        UUID income  = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        // Fund: A = ₹100, B = ₹500.
        ledger.allocate(tenantId, income, unalloc, 1_000_000L, "salary");
        ledger.allocate(tenantId, unalloc, a, 10_000L,  "budget A");
        ledger.allocate(tenantId, unalloc, b, 50_000L,  "budget B");

        long transfersBefore = countTransfers();
        long entriesBefore   = countEntries();
        long aBalanceBefore  = ledger.balanceMinor(tenantId, a);
        long bBalanceBefore  = ledger.balanceMinor(tenantId, b);
        long aCacheBefore    = readBalanceCache(a);
        long bCacheBefore    = readBalanceCache(b);

        // Try to allocate ₹500 from A->B. B would be fine (would go to ₹1,000),
        // but A would be driven to -₹400 — the second invariant check must
        // reject the WHOLE transfer.
        try {
            ledger.allocate(tenantId, a, b, 50_000L, "would-overdraw-A");
        } catch (LedgerException.WouldGoNegative expected) {
            // expected
        }

        // No transfer row, no entry rows, no cache movement.
        assertThat(countTransfers()).as("no ledger_transfer row written on rejection")
            .isEqualTo(transfersBefore);
        assertThat(countEntries()).as("no ledger_entries row written on rejection")
            .isEqualTo(entriesBefore);
        assertThat(ledger.balanceMinor(tenantId, a)).isEqualTo(aBalanceBefore);
        assertThat(ledger.balanceMinor(tenantId, b)).isEqualTo(bBalanceBefore);
        assertThat(readBalanceCache(a)).isEqualTo(aCacheBefore);
        assertThat(readBalanceCache(b)).isEqualTo(bCacheBefore);

        // And we can still write afterwards — locks released cleanly.
        UUID txn = seedFakeTransaction();
        UUID ok = ledger.postSpend(tenantId, txn, b, 1_000L, "post-rollback spend");
        assertThat(ok).isNotNull();
    }

    // =====================================================================
    // 7. Pseudo-account uniqueness under concurrency — N threads racing the
    //    first-touch INSERT for income/unallocated/spent.
    // =====================================================================

    @Test
    @DisplayName("pseudo-account uniqueness: N concurrent first-spends create exactly ONE row per (tenant, kind)")
    void concurrent_first_spend_does_not_duplicate_pseudo_envelopes() throws Exception {
        // Fresh tenant from @BeforeEach — no pseudo rows yet. Seed one user
        // envelope with enough balance to satisfy all spends.
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        seedBudget(groceries, 10_000_000L); // ₹100,000

        // NOTE: seedBudget above had to materialise income + unallocated to fund
        // the envelope. To test "concurrent first-touch" we need an unwritten
        // pseudo kind. The 'spent' pseudo is the one that gets created by
        // postSpend's internal PseudoAccountResolver, NOT by seedBudget — so
        // 'spent' is genuinely first-touched by the racing spends below.
        Long spentBefore = ownerJdbc.queryForObject(
            "SELECT count(*) FROM envelopes WHERE kind = 'spent' AND tenant_id = ?",
            Long.class, tenantId);
        assertThat(spentBefore).as("'spent' pseudo not yet materialised").isZero();

        int N = 16;
        ExecutorService pool = Executors.newFixedThreadPool(N);
        CyclicBarrier barrier = new CyclicBarrier(N);
        List<UUID> txns = new ArrayList<>();
        for (int i = 0; i < N; i++) txns.add(seedFakeTransaction());

        try {
            List<Future<RaceOutcome>> futures = new ArrayList<>(N);
            for (int i = 0; i < N; i++) {
                final UUID txn = txns.get(i);
                futures.add(pool.submit(() -> attemptSpend(barrier, txn, groceries, 1_000L)));
            }
            int ok = 0, unexpected = 0;
            for (Future<RaceOutcome> f : futures) {
                RaceOutcome o = f.get(60, TimeUnit.SECONDS);
                if (o.transferId != null) ok++;
                else unexpected++;
            }
            assertThat(unexpected).as("no unexpected exceptions during pseudo-race").isZero();
            assertThat(ok).as("all N spends succeed (envelope has plenty of funds)").isEqualTo(N);

            // -- THE STRUCTURAL ASSERTION: exactly one row per (tenant, kind).
            //    Explicit tenant_id filter — owner bypasses RLS.
            Long spentRows = ownerJdbc.queryForObject(
                "SELECT count(*) FROM envelopes WHERE kind = 'spent' AND tenant_id = ?",
                Long.class, tenantId);
            Long incomeRows = ownerJdbc.queryForObject(
                "SELECT count(*) FROM envelopes WHERE kind = 'income' AND tenant_id = ?",
                Long.class, tenantId);
            Long unallocRows = ownerJdbc.queryForObject(
                "SELECT count(*) FROM envelopes WHERE kind = 'unallocated' AND tenant_id = ?",
                Long.class, tenantId);
            assertThat(spentRows).as("exactly one 'spent' row after the race").isEqualTo(1L);
            assertThat(incomeRows).as("exactly one 'income' row").isEqualTo(1L);
            assertThat(unallocRows).as("exactly one 'unallocated' row").isEqualTo(1L);

            // -- No orphan transfers: every transfer has >= 2 entries summing to zero.
            assertEveryTransferBalanced();
            assertSystemEntrySumZero();
        } finally {
            pool.shutdownNow();
        }
    }

    // =====================================================================
    // 8. Property pass — randomised sequence, seed-pinned, ~200 ops.
    // =====================================================================

    @Test
    @DisplayName("property: 200 randomised ops (allocate / postSpend / rollover) — invariants hold after every step")
    void randomised_property_sequence_preserves_all_invariants() {
        // Seed-pinned for reproducibility.
        Random r = new Random(0xC0FFEEL);

        UUID income  = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        // Three months of envelopes so rollover has somewhere to flow.
        String[] periods = { "2026-04", "2026-05", "2026-06" };
        String[] names   = { "Groceries", "Fun", "Rent", "Travel" };
        // (period, name) -> envelopeId
        java.util.Map<String, UUID> envByKey = new java.util.HashMap<>();
        for (String p : periods) {
            for (String n : names) {
                envByKey.put(p + "|" + n, ledger.ensureUserEnvelope(tenantId, n, p));
            }
        }

        // Seed income so allocate has something to draw from.
        ledger.allocate(tenantId, income, unalloc, 100_000_000L, "salary seed");

        // Track the rollover period cursor so we don't roll the same pair twice
        // (the production rollover wants distinct from/to and is run once per
        // boundary; the property test follows that semantics).
        int rolloverIdx = 0;

        int ops = 200;
        int allocCount = 0, spendCount = 0, rolloverCount = 0, rejected = 0;
        for (int i = 0; i < ops; i++) {
            int dice = r.nextInt(100);
            try {
                if (dice < 40) {
                    // allocate: unalloc -> random user envelope (current/future periods).
                    String p = periods[1 + r.nextInt(periods.length - 1)];
                    String n = names[r.nextInt(names.length)];
                    UUID dest = envByKey.get(p + "|" + n);
                    long amount = 100L + r.nextInt(10_000);
                    ledger.allocate(tenantId, unalloc, dest, amount, "rand-alloc");
                    allocCount++;
                } else if (dice < 90) {
                    // spend: random user envelope.
                    String p = periods[r.nextInt(periods.length)];
                    String n = names[r.nextInt(names.length)];
                    UUID src = envByKey.get(p + "|" + n);
                    long amount = 50L + r.nextInt(5_000);
                    UUID txn = seedFakeTransaction();
                    ledger.postSpend(tenantId, txn, src, amount, "rand-spend");
                    spendCount++;
                } else {
                    // rollover (rare). When all period boundaries have already
                    // been rolled, we treat the op as a "skip" and count it
                    // toward `rejected` so the bookkeeping totals add up to ops.
                    if (rolloverIdx + 1 < periods.length) {
                        ledger.rollover(tenantId, periods[rolloverIdx], periods[rolloverIdx + 1]);
                        rolloverIdx++;
                        rolloverCount++;
                    } else {
                        rejected++;
                    }
                }
            } catch (LedgerException.WouldGoNegative wgn) {
                rejected++;
            } catch (LedgerException.InvalidArguments ia) {
                // amount == 0 etc — should be impossible given our random ranges,
                // but tolerate so the test asserts the invariant, not the bounds.
                rejected++;
            }

            // -- AFTER EVERY STEP --
            try {
                assertEveryTransferBalanced();
                assertSystemEntrySumZero();
                assertNoUserEnvelopeNegative();
                assertAllCachesMatchEntries();
            } catch (AssertionError ae) {
                System.out.println("[property] invariant violated after op #" + (i + 1)
                    + " (alloc=" + allocCount + " spend=" + spendCount
                    + " rollover=" + rolloverCount + " rejected=" + rejected
                    + ") last dice=" + dice + " : " + ae.getMessage());
                throw ae;
            }
        }

        // Sanity: the test actually exercised the surface.
        assertThat(allocCount + spendCount + rolloverCount + rejected).isEqualTo(ops);
        assertThat(allocCount).as("randomiser produced allocates").isPositive();
        assertThat(spendCount).as("randomiser produced spends").isPositive();
    }

    // =====================================================================
    // Helpers — shared infra
    // =====================================================================

    /** Captured outcome of a racing operation; exactly one of the three fields is set. */
    private static final class RaceOutcome {
        final UUID transferId;
        final boolean failedWithNegative;
        final RuntimeException unexpected;
        RaceOutcome(UUID transferId, boolean failedWithNegative, RuntimeException unexpected) {
            this.transferId = transferId;
            this.failedWithNegative = failedWithNegative;
            this.unexpected = unexpected;
        }
    }

    /**
     * Spend that waits on a barrier so all racers arrive at {@code postSpend}
     * at the same time, then captures the result as a {@link RaceOutcome}.
     */
    private RaceOutcome attemptSpend(CyclicBarrier barrier, UUID txnId, UUID envelopeId, long amount) {
        try {
            barrier.await(30, TimeUnit.SECONDS);
        } catch (Exception e) {
            return new RaceOutcome(null, false, new RuntimeException("barrier failed", e));
        }
        return attemptSpendNoBarrier(txnId, envelopeId, amount);
    }

    private RaceOutcome attemptSpendNoBarrier(UUID txnId, UUID envelopeId, long amount) {
        try {
            UUID id = ledger.postSpend(tenantId, txnId, envelopeId, amount, "race");
            return new RaceOutcome(id, false, null);
        } catch (LedgerException.WouldGoNegative wgn) {
            return new RaceOutcome(null, true, null);
        } catch (RuntimeException other) {
            return new RaceOutcome(null, false, other);
        }
    }

    /** Fund {@code envelope} with the given paise amount via income -> unallocated -> envelope. */
    private void seedBudget(UUID envelope, long amountMinor) {
        UUID income  = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        ledger.allocate(tenantId, income, unalloc, amountMinor, "seed income");
        ledger.allocate(tenantId, unalloc, envelope, amountMinor, "seed budget");
    }

    // -- All audit queries below scope by tenant_id EXPLICITLY because they run
    //    under the OWNER role (superuser) which bypasses RLS. We do not want a
    //    leftover tenant from a prior test method to pollute the count.

    private long countTransfers() {
        return ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?", Long.class, tenantId);
    }

    private long countEntries() {
        return ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_entries WHERE tenant_id = ?", Long.class, tenantId);
    }

    private long readBalanceCache(UUID envelopeId) {
        return ownerJdbc.queryForObject(
            "SELECT balance_minor FROM envelopes WHERE id = ? AND tenant_id = ?",
            Long.class, envelopeId, tenantId);
    }

    /** Assert the denorm balance_minor cache matches the authoritative entry sum. */
    private void assertCacheMatchesEntries(UUID envelopeId) {
        long cache = readBalanceCache(envelopeId);
        long entrySum = ownerJdbc.queryForObject(
            "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries "
                + "WHERE envelope_id = ? AND tenant_id = ?",
            Long.class, envelopeId, tenantId);
        assertThat(cache)
            .as("balance_minor cache for envelope %s matches SUM(ledger_entries.delta_minor)", envelopeId)
            .isEqualTo(entrySum);
    }

    /** As above, for every envelope under the tenant. */
    private void assertAllCachesMatchEntries() {
        List<UUID> envIds = ownerJdbc.queryForList(
            "SELECT id FROM envelopes WHERE tenant_id = ?", UUID.class, tenantId);
        for (UUID id : envIds) {
            assertCacheMatchesEntries(id);
        }
    }

    /** Assert every {@code transfer_id}'s entries sum to zero. */
    private void assertEveryTransferBalanced() {
        List<Long> bad = ownerJdbc.queryForList(
            "SELECT SUM(delta_minor) FROM ledger_entries "
                + "WHERE tenant_id = ? "
                + "GROUP BY transfer_id HAVING SUM(delta_minor) <> 0",
            Long.class, tenantId);
        assertThat(bad).as("every transfer's entries sum to zero").isEmpty();
    }

    /** Assert tenant-wide entry sum is zero (money conserved). */
    private void assertSystemEntrySumZero() {
        Long total = ownerJdbc.queryForObject(
            "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries WHERE tenant_id = ?",
            Long.class, tenantId);
        assertThat(total).as("system-wide entry-sum invariant (money conserved)").isZero();
    }

    private void assertNoUserEnvelopeNegative() {
        List<Long> negatives = ownerJdbc.queryForList(
            "SELECT COALESCE(SUM(le.delta_minor), 0) AS bal "
                + "FROM envelopes e "
                + "LEFT JOIN ledger_entries le ON le.envelope_id = e.id AND le.tenant_id = e.tenant_id "
                + "WHERE e.kind = 'user' AND e.tenant_id = ? "
                + "GROUP BY e.id "
                + "HAVING COALESCE(SUM(le.delta_minor), 0) < 0",
            Long.class, tenantId);
        assertThat(negatives).as("no kind='user' envelope is negative").isEmpty();
    }

    private long sumAllUserEnvelopeBalances() {
        return ownerJdbc.queryForObject(
            "SELECT COALESCE(SUM(le.delta_minor), 0) "
                + "FROM envelopes e LEFT JOIN ledger_entries le ON le.envelope_id = e.id AND le.tenant_id = e.tenant_id "
                + "WHERE e.kind = 'user' AND e.tenant_id = ?",
            Long.class, tenantId);
    }

    /**
     * Insert a transactions row so we have a UUID that satisfies the
     * {@code ledger_entries.transaction_id} FK. Same shape as Geordi's helper.
     */
    private UUID seedFakeTransaction() {
        return ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
            List<UUID> existing = jdbc.queryForList("SELECT id FROM accounts LIMIT 1", UUID.class);
            UUID accountId = existing.isEmpty()
                ? jdbc.queryForObject(
                    "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                        + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                        + "        'TestBank', 'savings'::account_type, 'XXXX0000') "
                        + "RETURNING id",
                    UUID.class)
                : existing.get(0);

            String dedup = "dedup-" + UUID.randomUUID();
            return jdbc.queryForObject(
                "INSERT INTO transactions "
                    + "(tenant_id, account_id, posted_at, amount_minor, direction, "
                    + " raw_description, source, dedup_hash) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?, CURRENT_DATE, 0, 'debit'::transaction_direction, "
                    + "  'test', 'statement_upload'::ingestion_source, ?"
                    + ") RETURNING id",
                UUID.class,
                accountId, dedup);
        });
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
