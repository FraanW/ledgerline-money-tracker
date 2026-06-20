package com.ledgerline.categorizer;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.contracts.CurrencyCode;
import com.ledgerline.contracts.IngestionSource;
import com.ledgerline.contracts.Money;
import com.ledgerline.contracts.Transaction;
import com.ledgerline.contracts.TransactionDirection;
import com.ledgerline.ledger.EnvelopeKind;
import com.ledgerline.ledger.LedgerService;
import com.ledgerline.platform.db.TenantContext;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
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
 * M11 → M12 bridge tests for {@link CategorizeAndPostPublisher}.
 *
 * <p>Verifies the end-to-end flow without going through the M1 controller:
 * we hand-craft a {@link Transaction} (and insert the matching
 * {@code transactions} row), then call {@code publishIngested(...)} directly.
 *
 * <p>Covers:
 * <ul>
 *   <li>credit (income) transaction is ignored — no postSpend, no category update;</li>
 *   <li>categorised spend with matching envelope + sufficient balance → posts to that envelope;</li>
 *   <li>categorised spend with NO matching envelope → posts to Unallocated;</li>
 *   <li>categorised spend with matching envelope but insufficient balance → falls back to Unallocated;</li>
 *   <li>uncategorised spend → posts to Unallocated;</li>
 *   <li>idempotency: replays produce exactly one transfer (V5);</li>
 *   <li>tenant isolation: posts are visible only to their own tenant.</li>
 * </ul>
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CategorizeAndPostPublisherTest {

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

    private final java.util.List<UUID> seededTenants = new java.util.ArrayList<>();

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

        // The SUT (publisher + categorizer + ledger) runs under the
        // non-superuser app role — RLS is REAL.
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
            "M11 Bridge Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);

        accountId = ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'HDFC Bank', 'savings'::account_type, 'XXXX1234') "
                    + "RETURNING id",
                UUID.class));
    }

    // ---------------------------------------------------------------------
    // 1. Credit transactions are ignored
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("credit transaction is skipped — no postSpend, no category update")
    void credit_is_skipped() {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "SALARY", groceries);

        Transaction credit = persistTransaction(
            LocalDate.of(2026, 5, 1), 5_000_000L, TransactionDirection.credit,
            "SALARY CREDIT");

        publisher.publishIngested(credit);

        // No category was assigned (the publisher returned early).
        assertThat(transactionCategoryId(credit.id())).isNull();
        // No ledger transfer was created.
        assertThat(transferCountForTenant(tenantId)).isZero();
    }

    // ---------------------------------------------------------------------
    // 2. Uncategorised spend → Unallocated
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("uncategorised spend posts against Unallocated")
    void uncategorised_spend_posts_to_unallocated() {
        // No rules seeded.
        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 5), 150_000L, TransactionDirection.debit,
            "UPI/UNKNOWN/abc");

        publisher.publishIngested(debit);

        assertThat(transactionCategoryId(debit.id())).isNull();

        UUID unallocated = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        assertThat(ledger.balanceMinor(tenantId, unallocated)).isEqualTo(-150_000L);
        // Spent (sink) accumulated the same amount on the credit side.
        UUID spent = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.spent);
        assertThat(ledger.balanceMinor(tenantId, spent)).isEqualTo(150_000L);
    }

    // ---------------------------------------------------------------------
    // 3. Categorised spend, NO matching envelope → Unallocated
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("categorised spend with no envelope for (category, period) posts to Unallocated")
    void categorised_no_envelope_posts_to_unallocated() {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries);

        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 7), 200_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/xyz");

        publisher.publishIngested(debit);

        // category_id WAS persisted on the transaction row...
        assertThat(transactionCategoryId(debit.id())).isEqualTo(groceries);
        // ...but with no envelope to receive the post, Unallocated absorbs it.
        UUID unallocated = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        assertThat(ledger.balanceMinor(tenantId, unallocated)).isEqualTo(-200_000L);
    }

    // ---------------------------------------------------------------------
    // 4. Categorised spend, matching envelope, sufficient balance → that envelope
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("categorised spend with a funded envelope posts against THAT envelope")
    void categorised_with_funded_envelope_posts_there() {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries);

        // Create + fund a Groceries envelope for 2026-05, linked to the category.
        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 1_000_000L); // 10,000 INR budgeted

        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 10), 250_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/abc");

        publisher.publishIngested(debit);

        assertThat(transactionCategoryId(debit.id())).isEqualTo(groceries);
        // Groceries lost 2,500 INR; Unallocated untouched by THIS spend.
        assertThat(ledger.balanceMinor(tenantId, groceriesMay)).isEqualTo(1_000_000L - 250_000L);

        // The transfer linked to this transaction targets the user envelope, NOT Unallocated.
        UUID targetEnvelope = ownerJdbc.queryForObject(
            "SELECT envelope_id FROM ledger_entries "
                + "WHERE transaction_id = ? AND delta_minor < 0 AND tenant_id = ?",
            UUID.class, debit.id(), tenantId);
        assertThat(targetEnvelope).isEqualTo(groceriesMay);
    }

    // ---------------------------------------------------------------------
    // 5. Insufficient funds → Unallocated fallback
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("categorised spend on an underfunded envelope falls back to Unallocated")
    void insufficient_balance_falls_back_to_unallocated() {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries);

        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 100_000L); // only 1,000 INR

        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 15), 500_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/big-spend");

        publisher.publishIngested(debit);

        // Groceries was NOT touched by the spend — the WouldGoNegative
        // attempt rolled back before any entry committed.
        assertThat(ledger.balanceMinor(tenantId, groceriesMay)).isEqualTo(100_000L);

        // Unallocated absorbed the full 5,000 INR.
        UUID unallocated = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        // Note: Unallocated may already have its own movements from other tests
        // in the suite running against an external DB. Use the linked-transfer
        // assertion below as the authoritative check.

        // The transfer linked to this transaction targets Unallocated, not Groceries.
        UUID targetEnvelope = ownerJdbc.queryForObject(
            "SELECT envelope_id FROM ledger_entries "
                + "WHERE transaction_id = ? AND delta_minor < 0 AND tenant_id = ?",
            UUID.class, debit.id(), tenantId);
        assertThat(targetEnvelope).isEqualTo(unallocated);

        // Exactly one transfer for this transaction (no leftover from the failed attempt).
        long transferCount = ownerJdbc.queryForObject(
            "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                + "WHERE transaction_id = ? AND tenant_id = ?",
            Long.class, debit.id(), tenantId);
        assertThat(transferCount).isEqualTo(1L);
    }

    // ---------------------------------------------------------------------
    // 6. Idempotency: replays produce exactly one transfer
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("publishIngested replays for the same transaction post exactly one transfer (V5)")
    void replay_is_idempotent() {
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries);

        UUID groceriesMay = ledger.ensureUserEnvelope(tenantId, "Groceries", "2026-05");
        linkEnvelopeToCategory(groceriesMay, groceries);
        fundEnvelope(groceriesMay, 1_000_000L);

        Transaction debit = persistTransaction(
            LocalDate.of(2026, 5, 12), 200_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/replay");

        publisher.publishIngested(debit);
        publisher.publishIngested(debit);
        publisher.publishIngested(debit);

        // Balance moved ONCE.
        assertThat(ledger.balanceMinor(tenantId, groceriesMay))
            .isEqualTo(1_000_000L - 200_000L);

        // Exactly one transfer + two entries for this transaction.
        long transferCount = ownerJdbc.queryForObject(
            "SELECT count(DISTINCT transfer_id) FROM ledger_entries "
                + "WHERE transaction_id = ? AND tenant_id = ?",
            Long.class, debit.id(), tenantId);
        long entryCount = ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_entries "
                + "WHERE transaction_id = ? AND tenant_id = ?",
            Long.class, debit.id(), tenantId);
        assertThat(transferCount).isEqualTo(1L);
        assertThat(entryCount).isEqualTo(2L);
    }

    // ---------------------------------------------------------------------
    // 7. Tenant isolation
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("posts are tenant-scoped: tenant B sees zero ledger activity from tenant A's spend")
    void tenant_isolation_on_posts() {
        UUID tenantA = tenantId;
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M11 Bridge Tenant B " + UUID.randomUUID());
        seededTenants.add(tenantB);
        ownerTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'ICICI Bank', 'current'::account_type, 'XXXX9999')"));

        // Tenant A: rule + category + spend.
        UUID groceries = seedCategory("Groceries");
        seedRule("contains", "BIGBAZAAR", groceries);
        Transaction debitA = persistTransaction(
            LocalDate.of(2026, 5, 18), 100_000L, TransactionDirection.debit,
            "UPI/BIGBAZAAR/tenant-A");
        publisher.publishIngested(debitA);

        // Tenant B has its own world: zero rules, zero transfers from A's activity.
        long bTransfers = ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?",
            Long.class, tenantB);
        assertThat(bTransfers).isZero();

        // Tenant B's match() does not see tenant A's rule.
        assertThat(categorizer.match(tenantB, "UPI/BIGBAZAAR/xyz", null)).isEmpty();

        // Tenant A's spend produced a transfer in A's scope.
        long aTransfers = ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?",
            Long.class, tenantA);
        assertThat(aTransfers).isGreaterThanOrEqualTo(1L);
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private UUID seedCategory(String name) {
        return ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO categories (tenant_id, name, kind) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        ?, 'expense'::category_kind) "
                    + "RETURNING id",
                UUID.class,
                name));
    }

    private void seedRule(String kind, String pattern, UUID categoryId) {
        ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO categorization_rules "
                    + "(tenant_id, pattern_kind, pattern, category_id, priority, enabled) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?::rule_pattern_kind, ?, ?, 100, true"
                    + ")",
                kind, pattern, categoryId));
    }

    /**
     * Insert a {@code transactions} row and return the domain {@link Transaction}
     * the publisher would have been called with. Mirrors the shape M1's
     * {@code IngestionService.insertAll} emits when it calls the publisher hook.
     */
    private Transaction persistTransaction(
        LocalDate postedAt,
        long amountMinor,
        TransactionDirection direction,
        String rawDescription
    ) {
        String dedup = "dedup-" + UUID.randomUUID();
        Instant ingestedAt = Instant.now();
        UUID id = ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
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
                accountId, postedAt, amountMinor, direction.name(),
                rawDescription, dedup, java.sql.Timestamp.from(ingestedAt)));
        return new Transaction(
            id, tenantId, accountId, postedAt,
            new Money(amountMinor, CurrencyCode.INR), direction,
            rawDescription, null, null,
            IngestionSource.statement_upload, dedup, ingestedAt);
    }

    /** Link a user envelope to a category — what the bridge looks up. */
    private void linkEnvelopeToCategory(UUID envelopeId, UUID categoryId) {
        ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.update(
                "UPDATE envelopes SET category_id = ? WHERE id = ?",
                categoryId, envelopeId));
    }

    /** Fund an envelope by allocating money INTO it from Unallocated. */
    private void fundEnvelope(UUID envelopeId, long amountMinor) {
        UUID income     = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.income);
        UUID unalloc    = ledger.ensurePseudoEnvelope(tenantId, EnvelopeKind.unallocated);
        ledger.allocate(tenantId, income, unalloc, amountMinor, "test income");
        ledger.allocate(tenantId, unalloc, envelopeId, amountMinor, "test budget");
    }

    private UUID transactionCategoryId(UUID txnId) {
        List<UUID> ids = ownerJdbc.queryForList(
            "SELECT category_id FROM transactions WHERE id = ? AND tenant_id = ?",
            UUID.class, txnId, tenantId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private long transferCountForTenant(UUID tenantId) {
        return ownerJdbc.queryForObject(
            "SELECT count(*) FROM ledger_transfers WHERE tenant_id = ?",
            Long.class, tenantId);
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
