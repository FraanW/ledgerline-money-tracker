package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.platform.db.TenantContext;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
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
 * Integration tests for M1 ingestion against a real Postgres.
 *
 * <p>Mirrors the dual-mode harness used by {@code LedgerServiceTest} /
 * {@code RlsIsolationTest}: external alt-port via {@code TEST_DATABASE_URL}
 * if set, else an ephemeral Testcontainers Postgres 16. Either way, Flyway
 * applies V1-V5 before the suite, and the SUT (the IngestionService) runs
 * under the non-superuser {@code ledgerline_app} role so RLS is actually
 * enforced — running as owner would silently bypass tenant isolation.
 *
 * <p>Covers:
 * <ul>
 *   <li>happy-path ingest: a representative CSV writes the expected rows
 *       with the expected fields;</li>
 *   <li>idempotent re-upload: feeding the same file twice produces
 *       0 accepted + N duplicates on the second pass;</li>
 *   <li>overlapping ranges: a partial overlap only inserts the new rows;</li>
 *   <li>malformed-row resilience: a bad line surfaces in errors[] and does
 *       not poison the rest of the file;</li>
 *   <li>tenant isolation: a row written under tenant A is invisible to
 *       tenant B (mirrors the M5 RLS proof).</li>
 * </ul>
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class IngestionServiceTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container; // null in external mode

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;  // fixture seeding only

    private IngestionService ingestion;
    private TenantContext appTenantContext;    // the SUT's tenant context

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
            .baselineOnMigrate(true) // tolerate pre-existing external DB
            .load()
            .migrate();
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        // SUT runs under the non-superuser app role (RLS is REAL).
        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        this.appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        this.ingestion = new IngestionService(
            appTenantContext,
            new CsvStatementParser(),
            txn -> { /* no-op publisher (the v0 default) */ }
        );
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
            "M1 Ingestion Test Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);

        // Accounts are under FORCE RLS — even owner must scope context to insert.
        accountId = ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'HDFC Bank', 'savings'::account_type, 'XXXX1234') "
                    + "RETURNING id",
                UUID.class));
    }

    // ---------------------------------------------------------------------
    // 1. Happy path — a representative CSV produces the expected rows
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("happy path: a representative CSV writes one row per parsed line")
    void happy_path_ingest_writes_expected_rows() throws IOException {
        String csv = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/BIGBAZAAR/123,"1,499.50",
            2026-05-02,SALARY CREDIT,,"50,000.00"
            2026-05-03,UPI/SWIGGY/abc,250.00,
            """;

        IngestionResult result = ingestion.ingest(tenantId, accountId, asStream(csv));

        assertThat(result.totalRows()).isEqualTo(3);
        assertThat(result.accepted()).isEqualTo(3);
        assertThat(result.duplicates()).isZero();
        assertThat(result.errors()).isEmpty();

        // Verify the rows are visible to the tenant (RLS scoped read).
        List<Long> amounts = appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForList(
                "SELECT amount_minor FROM transactions ORDER BY posted_at",
                Long.class));
        assertThat(amounts).containsExactly(149_950L, 5_000_000L, 25_000L);

        // source, currency, and null categoryId/merchant invariants on insert.
        appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
            Integer sourceCount = jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE source = 'statement_upload'",
                Integer.class);
            assertThat(sourceCount).isEqualTo(3);
            Integer nullCatCount = jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE category_id IS NULL AND merchant IS NULL",
                Integer.class);
            assertThat(nullCatCount).isEqualTo(3);
        });
    }

    // ---------------------------------------------------------------------
    // 2. Idempotent re-upload: feeding the same file twice is safe.
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("re-uploading the same file: second pass is all duplicates, ledger unchanged")
    void re_uploading_same_file_is_idempotent() throws IOException {
        String csv = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/BIGBAZAAR/123,100.00,
            2026-05-02,UPI/SWIGGY,250.00,
            """;

        IngestionResult first = ingestion.ingest(tenantId, accountId, asStream(csv));
        assertThat(first.accepted()).isEqualTo(2);
        assertThat(first.duplicates()).isZero();

        IngestionResult second = ingestion.ingest(tenantId, accountId, asStream(csv));
        assertThat(second.accepted()).isZero();
        assertThat(second.duplicates()).isEqualTo(2);
        assertThat(second.errors()).isEmpty();

        // Only ONE physical copy of each row exists.
        Integer count = appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject("SELECT count(*) FROM transactions", Integer.class));
        assertThat(count).isEqualTo(2);
    }

    // ---------------------------------------------------------------------
    // 3. Overlapping ranges: only the new rows insert (the steady-state loop)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("overlapping ranges: only the genuinely-new rows insert")
    void overlapping_ranges_only_insert_new_rows() throws IOException {
        // Month-1 statement.
        String month1 = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/BIGBAZAAR/123,100.00,
            2026-05-02,UPI/SWIGGY,250.00,
            2026-05-03,UPI/AMAZON,500.00,
            """;
        // Month-2 statement that overlaps the last two rows (bank exports run to "today").
        String month2 = """
            Date,Description,Debit,Credit
            2026-05-02,UPI/SWIGGY,250.00,
            2026-05-03,UPI/AMAZON,500.00,
            2026-05-04,UPI/UBER,150.00,
            2026-05-05,UPI/STARBUCKS,300.00,
            """;

        IngestionResult r1 = ingestion.ingest(tenantId, accountId, asStream(month1));
        assertThat(r1.accepted()).isEqualTo(3);
        assertThat(r1.duplicates()).isZero();

        IngestionResult r2 = ingestion.ingest(tenantId, accountId, asStream(month2));
        assertThat(r2.accepted()).isEqualTo(2);     // only Uber + Starbucks are new
        assertThat(r2.duplicates()).isEqualTo(2);   // Swiggy + Amazon already present
        assertThat(r2.errors()).isEmpty();

        Integer count = appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject("SELECT count(*) FROM transactions", Integer.class));
        assertThat(count).isEqualTo(5);
    }

    // ---------------------------------------------------------------------
    // 4. Malformed-row resilience
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("one malformed row in the middle: the rest ingest, the bad row is in errors[]")
    void malformed_row_does_not_poison_the_rest() throws IOException {
        String csv = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/GOODROW,100.00,
            2026-05-02,UPI/AMBIGUOUS,50.00,75.00
            2026-05-03,UPI/ANOTHER GOOD,200.00,
            """;

        IngestionResult result = ingestion.ingest(tenantId, accountId, asStream(csv));

        assertThat(result.totalRows()).isEqualTo(3);
        assertThat(result.accepted()).isEqualTo(2);
        assertThat(result.duplicates()).isZero();
        assertThat(result.errors()).hasSize(1);
        assertThat(result.errors().get(0).message()).contains("Debit / Credit");

        Integer count = appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject("SELECT count(*) FROM transactions", Integer.class));
        assertThat(count).isEqualTo(2);
    }

    // ---------------------------------------------------------------------
    // 5. Tenant isolation — mirrors RlsIsolationTest's claim for the
    //    ingestion path specifically.
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("a row ingested under tenant A is invisible under tenant B context")
    void tenant_isolation_holds() throws IOException {
        // Seed a second tenant + account (the @BeforeEach gave us tenant A).
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class, "M1 Ingestion Tenant B " + UUID.randomUUID());
        seededTenants.add(tenantB);
        UUID accountB = ownerTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'ICICI Bank', 'current'::account_type, 'XXXX9999') "
                    + "RETURNING id",
                UUID.class));

        String csv = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/TENANT-A-ONLY,777.00,
            """;
        IngestionResult r = ingestion.ingest(tenantId, accountId, asStream(csv));
        assertThat(r.accepted()).isEqualTo(1);

        // Tenant A sees the row.
        Integer seenByA = appTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE raw_description = 'UPI/TENANT-A-ONLY'",
                Integer.class));
        assertThat(seenByA).isEqualTo(1);

        // Tenant B does NOT see the row (RLS filtered).
        Integer seenByB = appTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "SELECT count(*) FROM transactions WHERE raw_description = 'UPI/TENANT-A-ONLY'",
                Integer.class));
        assertThat(seenByB).isZero();
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private static ByteArrayInputStream asStream(String csv) {
        return new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8));
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
