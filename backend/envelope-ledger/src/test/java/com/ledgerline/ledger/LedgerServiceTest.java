package com.ledgerline.ledger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * M12 happy-path + invariant tests for {@link LedgerService}.
 *
 * <p>This is the deliberately-non-adversarial suite. It exercises:
 * <ul>
 *   <li>balanced allocate / spend / re-budget transfers post correctly and the
 *       sum-to-zero invariant holds for the inserted entries;</li>
 *   <li>a spend that would push a user envelope negative is rejected and
 *       NOTHING is written (atomic-transfer rollback);</li>
 *   <li>rollover at a period boundary moves leftover balances forward via
 *       balanced transfers; invariants hold post-rollover;</li>
 *   <li>{@code postSpend} is idempotent on {@code transactionId} — replays yield
 *       one transfer.</li>
 * </ul>
 *
 * <p>The concurrency / race / adversarial battery is Worf's scope and will land
 * in a separate test class. This suite stays on the happy path.
 *
 * <p>Runs against a real Postgres via either {@code -Dledgerline.test.jdbc-url}
 * (external alt-port mode — the path used on this machine) or an ephemeral
 * Testcontainers pg16 with pgvector. Either way it applies all four Flyway
 * migrations (V1-V4) before each test method so envelope+entry tables are clean.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LedgerServiceTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    // Non-superuser app role created by V1. The SUT (LedgerService) MUST run
    // under this role so that RLS — and crucially FORCE ROW LEVEL SECURITY —
    // is actually enforced. Running the SUT as owner (superuser) silently
    // bypasses RLS and lets PseudoAccountResolver.resolve return ANOTHER
    // tenant's pseudo row in a cross-class run (Worf's M12 finding).
    // Owner is reserved for fixture seeding + audit-scope queries (those
    // explicitly filter by tenant_id; see helper methods).
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container; // null in external mode

    private DataSource ownerDs;
    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext; // fixture seeding + audits only

    private LedgerService ledger; // runs under the non-superuser app role

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
            .baselineOnMigrate(true) // tolerate pre-existing external DB
            .load()
            .migrate();
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        // The SUT runs through the non-superuser app role so RLS is REAL
        // (mirrors LedgerConcurrencyTest + RlsIsolationTest). Owner is only
        // used for fixture seeding (tenants table, accounts) and tenant-
        // scoped audit queries below.
        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        TenantContext appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        this.ledger = new LedgerService(appTenantContext);
    }

    @AfterAll
    void tearDown() {
        // External DB persists across runs — clean up seeded tenants (cascades
        // through accounts/envelopes/transactions/ledger_*). Harmless no-op in
        // Testcontainers mode.
        if (ownerJdbc != null) {
            for (UUID t : seededTenants) {
                ownerJdbc.update("DELETE FROM tenants WHERE id = ?", t);
            }
        }
        if (container != null) {
            container.stop();
        }
    }

    /**
     * Each test gets a fresh tenant so leftovers from one test cannot affect
     * another (handy when running against the external DB across runs).
     */
    private UUID tenantId;
    private final java.util.List<UUID> seededTenants = new java.util.ArrayList<>();

    @BeforeEach
    void freshTenant() {
        tenantId = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M12 Test Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);
    }

    // ---------------------------------------------------------------------
    // 1. Allocate / spend / re-budget post correctly and sum to zero
    // ---------------------------------------------------------------------

    @Test
    void allocate_income_then_budget_then_spend_then_rebudget_posts_balanced_transfers() {
        // Setup: user envelopes Groceries and Fun in 2026-05.
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID fun       = ledger.ensureUserEnvelope(tenantId, "Fun",       "2026-05");
        UUID income    = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc   = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        UUID spent     = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.spent);

        // 1. Income arrives: Income -50,000 INR -> Unallocated +50,000 INR (5_000_000 paise).
        UUID incomeTransferId =
            ledger.allocate(tenantId, income, unalloc, 5_000_000L, "salary");
        assertSumToZero(incomeTransferId);
        assertThat(ledger.balanceMinor(tenantId, income)).isEqualTo(-5_000_000L);
        assertThat(ledger.balanceMinor(tenantId, unalloc)).isEqualTo( 5_000_000L);

        // 2. Allocate 8,000 INR to Groceries.
        ledger.allocate(tenantId, unalloc, groceries, 800_000L, "budget: Groceries");
        // 3. Allocate 3,000 INR to Fun.
        ledger.allocate(tenantId, unalloc, fun, 300_000L, "budget: Fun");

        assertThat(ledger.balanceMinor(tenantId, unalloc)).isEqualTo(5_000_000L - 800_000L - 300_000L);
        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(800_000L);
        assertThat(ledger.balanceMinor(tenantId, fun)).isEqualTo(300_000L);

        // 4. Spend 1,500 INR from Groceries (linked to a fake bank transaction).
        UUID txnId = seedFakeTransaction(tenantId);
        UUID spendTransferId =
            ledger.postSpend(tenantId, txnId, groceries, 150_000L, "spend: BigBazaar");
        assertSumToZero(spendTransferId);
        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(800_000L - 150_000L);
        assertThat(ledger.balanceMinor(tenantId, spent)).isEqualTo(150_000L);

        // 5. Re-budget 200 INR from Fun -> Groceries (envelope -> envelope, no pseudo).
        UUID rebudgetTransferId =
            ledger.allocate(tenantId, fun, groceries, 20_000L, "rebudget Fun -> Groceries");
        assertSumToZero(rebudgetTransferId);
        assertThat(ledger.balanceMinor(tenantId, fun)).isEqualTo(300_000L - 20_000L);
        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(800_000L - 150_000L + 20_000L);

        // Cross-check: every transfer in the system sums to zero.
        // Explicit tenant_id filter — owner bypasses RLS.
        List<UUID> allTransfers = ownerJdbc.queryForList(
            "SELECT id FROM ledger_transfers WHERE tenant_id = ?", UUID.class, tenantId);
        for (UUID id : allTransfers) {
            assertSumToZero(id);
        }
    }

    // ---------------------------------------------------------------------
    // 2. Never-negative: a spend that would push a user envelope below zero
    //    is rejected, and NOTHING is written.
    // ---------------------------------------------------------------------

    @Test
    void spend_that_would_go_negative_is_rejected_and_nothing_is_written() {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID income    = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc   = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        // Budget exactly 1,000 INR into Groceries.
        ledger.allocate(tenantId, income, unalloc, 100_000L, "salary");
        ledger.allocate(tenantId, unalloc, groceries, 100_000L, "budget");

        long transfersBefore = countTransfers(tenantId);
        long entriesBefore = countEntries(tenantId);

        // Attempt to spend 1,200 INR — would push Groceries to -200 INR.
        UUID txnId = seedFakeTransaction(tenantId);
        assertThatThrownBy(() ->
            ledger.postSpend(tenantId, txnId, groceries, 120_000L, "overspend"))
            .isInstanceOf(LedgerException.WouldGoNegative.class);

        // The whole transfer must have rolled back — counts unchanged.
        assertThat(countTransfers(tenantId)).isEqualTo(transfersBefore);
        assertThat(countEntries(tenantId)).isEqualTo(entriesBefore);
        // Balances unchanged.
        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(100_000L);
    }

    @Test
    void rebudget_that_would_go_negative_is_rejected() {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID fun       = ledger.ensureUserEnvelope(tenantId, "Fun",       "2026-05");
        UUID income    = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc   = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        ledger.allocate(tenantId, income, unalloc, 100_000L, "salary");
        ledger.allocate(tenantId, unalloc, groceries, 50_000L, "budget");

        // Try to re-budget more out of Groceries than it holds.
        assertThatThrownBy(() ->
            ledger.allocate(tenantId, groceries, fun, 60_000L, "rebudget"))
            .isInstanceOf(LedgerException.WouldGoNegative.class);

        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(50_000L);
        assertThat(ledger.balanceMinor(tenantId, fun)).isZero();
    }

    // ---------------------------------------------------------------------
    // 3. Rollover at a period boundary moves leftover balances correctly.
    // ---------------------------------------------------------------------

    @Test
    void rollover_moves_leftover_balances_forward_via_balanced_transfers() {
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID funMay       = ledger.ensureUserEnvelope(tenantId, "Fun",       "2026-05");
        UUID rentMay      = ledger.ensureUserEnvelope(tenantId, "Rent",      "2026-05");
        UUID income       = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc      = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        // Income 50k, budget Groceries 8k, Fun 3k, Rent 15k.
        ledger.allocate(tenantId, income, unalloc, 5_000_000L, "salary");
        ledger.allocate(tenantId, unalloc, groceriesMay, 800_000L, "budget");
        ledger.allocate(tenantId, unalloc, funMay,       300_000L, "budget");
        ledger.allocate(tenantId, unalloc, rentMay,    1_500_000L, "budget");

        // Spend: Groceries 6,500 INR (so 1,500 INR leftover), Rent fully (0 leftover).
        UUID t1 = seedFakeTransaction(tenantId);
        UUID t2 = seedFakeTransaction(tenantId);
        ledger.postSpend(tenantId, t1, groceriesMay, 650_000L,   "spend");
        ledger.postSpend(tenantId, t2, rentMay,    1_500_000L,   "spend");

        long groceriesLeftoverMay = ledger.balanceMinor(tenantId, groceriesMay);
        long funLeftoverMay       = ledger.balanceMinor(tenantId, funMay);
        long rentLeftoverMay      = ledger.balanceMinor(tenantId, rentMay);
        assertThat(groceriesLeftoverMay).isEqualTo(150_000L);
        assertThat(funLeftoverMay).isEqualTo(300_000L);
        assertThat(rentLeftoverMay).isZero();

        // ---- Roll May -> June ----
        List<UUID> rolloverTransferIds = ledger.rollover(tenantId, "2026-05", "2026-06");

        // Two transfers expected (Groceries + Fun); Rent had zero so it is skipped.
        assertThat(rolloverTransferIds).hasSize(2);
        for (UUID id : rolloverTransferIds) {
            assertSumToZero(id);
        }

        // May envelopes are now zeroed (each had its leftover transferred out).
        assertThat(ledger.balanceMinor(tenantId, groceriesMay)).isZero();
        assertThat(ledger.balanceMinor(tenantId, funMay)).isZero();
        assertThat(ledger.balanceMinor(tenantId, rentMay)).isZero();

        // June envelopes carry the leftovers; Rent in June was NOT created
        // (nothing to roll), per the design — rollover only creates the
        // counterpart when there is something to move.
        UUID groceriesJune = lookupUserEnvelope(tenantId, "Groceries", "2026-06");
        UUID funJune       = lookupUserEnvelope(tenantId, "Fun",       "2026-06");
        assertThat(ledger.balanceMinor(tenantId, groceriesJune)).isEqualTo(150_000L);
        assertThat(ledger.balanceMinor(tenantId, funJune)).isEqualTo(300_000L);

        // No Rent envelope for June exists (rollover skipped it because leftover was zero).
        assertThat(maybeLookupUserEnvelope(tenantId, "Rent", "2026-06")).isNull();
    }

    // ---------------------------------------------------------------------
    // 4. Idempotency: posting the same transactionId twice yields ONE transfer.
    // ---------------------------------------------------------------------

    @Test
    void postSpend_is_idempotent_on_transaction_id() {
        UUID groceries = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        UUID income    = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc   = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);

        ledger.allocate(tenantId, income, unalloc, 1_000_000L, "salary");
        ledger.allocate(tenantId, unalloc, groceries, 500_000L, "budget");

        UUID txnId = seedFakeTransaction(tenantId);
        UUID first  = ledger.postSpend(tenantId, txnId, groceries, 100_000L, "spend");
        UUID second = ledger.postSpend(tenantId, txnId, groceries, 100_000L, "spend (replay)");
        UUID third  = ledger.postSpend(tenantId, txnId, groceries, 100_000L, "spend (replay 2)");

        // All three return the SAME transferId — only the first one wrote anything.
        assertThat(second).isEqualTo(first);
        assertThat(third).isEqualTo(first);

        // Exactly ONE transfer exists for that transaction; exactly 2 entries (the
        // two legs of the one transfer). Owner bypasses RLS so filter explicitly.
        long transferCount = ownerJdbc.queryForObject(
            "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                + "WHERE transaction_id = ? AND tenant_id = ?",
            Long.class, txnId, tenantId);
        long entryCount = ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_entries WHERE transaction_id = ? AND tenant_id = ?",
            Long.class, txnId, tenantId);
        assertThat(transferCount).isEqualTo(1L);
        assertThat(entryCount).isEqualTo(2L);

        // Balance reflects ONE spend, not three.
        assertThat(ledger.balanceMinor(tenantId, groceries)).isEqualTo(500_000L - 100_000L);
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    // Audit queries run as the OWNER (superuser) which BYPASSES RLS — so we
    // MUST filter by tenant_id explicitly, otherwise leftover rows from prior
    // test classes / runs would leak into the counts. Mirror Worf's pattern in
    // LedgerConcurrencyTest.
    private void assertSumToZero(UUID transferId) {
        Long sum = ownerJdbc.queryForObject(
            "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries "
                + "WHERE transfer_id = ? AND tenant_id = ?",
            Long.class,
            transferId, tenantId);
        assertThat(sum)
            .as("sum-to-zero invariant for transfer %s", transferId)
            .isZero();
    }

    private long countTransfers(UUID tenantId) {
        return ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?",
            Long.class, tenantId);
    }

    private long countEntries(UUID tenantId) {
        return ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_entries WHERE tenant_id = ?",
            Long.class, tenantId);
    }

    private UUID lookupUserEnvelope(UUID tenantId, String name, String period) {
        UUID id = maybeLookupUserEnvelope(tenantId, name, period);
        if (id == null) {
            throw new AssertionError("envelope " + name + "/" + period + " not found");
        }
        return id;
    }

    private UUID maybeLookupUserEnvelope(UUID tenantId, String name, String period) {
        // Owner bypasses RLS — filter by tenant_id explicitly.
        List<UUID> ids = ownerJdbc.queryForList(
            "SELECT id FROM envelopes WHERE kind = 'user' AND name = ? AND period = ? "
                + "AND tenant_id = ?",
            UUID.class,
            name, period, tenantId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * Insert a minimal {@code transactions} row so we have a UUID that satisfies
     * the {@code ledger_entries.transaction_id} FK. The contents do not matter
     * for ledger tests — only the existence and uniqueness of the id.
     */
    private UUID seedFakeTransaction(UUID tenantId) {
        return ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
            // The transactions table needs an account; create one on demand.
            List<UUID> existing = jdbc.queryForList(
                "SELECT id FROM accounts LIMIT 1", UUID.class);
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
