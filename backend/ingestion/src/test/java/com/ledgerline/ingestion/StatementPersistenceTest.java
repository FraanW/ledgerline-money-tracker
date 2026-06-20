package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.platform.db.TenantContext;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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
 * V12 — the {@code statements} batch row + {@code transactions.statement_id}
 * back-link (Sweep 1). Dual-mode harness mirroring
 * {@link IngestionConcurrencyTest}; the SUT runs under the non-superuser
 * {@code ledgerline_app} role so RLS is real.
 *
 * <p>Covers: the batch row carries the final counts + errors jsonb + status;
 * accepted transactions point back at their batch; a re-upload produces a
 * SECOND batch row that honestly records 0 accepted / N duplicates while the
 * first row is untouched.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StatementPersistenceTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container;

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;
    private TenantContext appTenantContext;

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

        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        this.appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
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
            "V12 Statement Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);
        accountId = ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        'HDFC Bank', 'savings'::account_type, 'XXXX1234') "
                    + "RETURNING id",
                UUID.class));
    }

    private static final String CSV = """
        Date,Description,Debit,Credit
        2026-06-01,UPI/BIGBAZAAR/77,1499.50,
        2026-06-02,SALARY CREDIT,,50000.00
        2026-06-03,WEIRD ROW,,
        """;

    @Test
    @DisplayName("upload persists the batch: counts + errors jsonb + completed status; transactions point back; re-upload writes an honest second batch")
    void statement_batch_row_is_persisted_and_linked() throws Exception {
        IngestionService svc = new IngestionService(
            appTenantContext, new CsvStatementParser(), txn -> {});

        UUID actingUser = UUID.randomUUID(); // GUC-only in this path; no FK on it

        // ---- first upload: 2 good rows + 1 malformed ----
        IngestionResult r1 = svc.ingest(tenantId, actingUser, accountId, "june.csv", asStream(CSV));
        assertThat(r1.totalRows()).isEqualTo(3);
        assertThat(r1.accepted()).isEqualTo(2);
        assertThat(r1.duplicates()).isZero();
        assertThat(r1.errors()).hasSize(1);

        // The batch row, exactly as the response described it.
        java.util.Map<String, Object> batch = ownerJdbc.queryForMap(
            "SELECT file_name, account_id, accepted_count, duplicate_count, error_count, "
                + "errors::text AS errors_json, status::text AS status "
                + "FROM statements WHERE id = ?",
            r1.statementId());
        assertThat(batch.get("file_name")).isEqualTo("june.csv");
        assertThat(batch.get("account_id")).isEqualTo(accountId);
        assertThat(batch.get("accepted_count")).isEqualTo(2);
        assertThat(batch.get("duplicate_count")).isEqualTo(0);
        assertThat(batch.get("error_count")).isEqualTo(1);
        assertThat(batch.get("status")).isEqualTo("completed");
        assertThat((String) batch.get("errors_json"))
            .as("errors jsonb carries the per-row failures")
            .contains("lineNumber").contains("message");

        // Accepted transactions are stamped with their batch.
        Integer linked = ownerJdbc.queryForObject(
            "SELECT count(*) FROM transactions WHERE statement_id = ?",
            Integer.class, r1.statementId());
        assertThat(linked).isEqualTo(2);

        // ---- re-upload of the same bytes: honest second batch ----
        IngestionResult r2 = svc.ingest(tenantId, actingUser, accountId, "june.csv", asStream(CSV));
        assertThat(r2.statementId()).isNotEqualTo(r1.statementId());
        assertThat(r2.accepted()).isZero();
        assertThat(r2.duplicates()).isEqualTo(2);
        assertThat(r2.errors()).hasSize(1);

        java.util.Map<String, Object> batch2 = ownerJdbc.queryForMap(
            "SELECT accepted_count, duplicate_count, error_count, status::text AS status "
                + "FROM statements WHERE id = ?",
            r2.statementId());
        assertThat(batch2.get("accepted_count")).isEqualTo(0);
        assertThat(batch2.get("duplicate_count")).isEqualTo(2);
        assertThat(batch2.get("error_count")).isEqualTo(1);
        assertThat(batch2.get("status")).isEqualTo("completed");

        // The duplicates still point at their ORIGINAL batch — never restamped.
        Integer stillLinkedToFirst = ownerJdbc.queryForObject(
            "SELECT count(*) FROM transactions WHERE statement_id = ?",
            Integer.class, r1.statementId());
        assertThat(stillLinkedToFirst).isEqualTo(2);

        // Two batch rows total for this tenant.
        Integer batches = ownerJdbc.queryForObject(
            "SELECT count(*) FROM statements WHERE tenant_id = ?",
            Integer.class, tenantId);
        assertThat(batches).isEqualTo(2);
    }

    @Test
    @DisplayName("legacy tenant-only overload still works and persists a batch with the default file name")
    void legacy_overload_persists_default_filename() throws Exception {
        IngestionService svc = new IngestionService(
            appTenantContext, new CsvStatementParser(), txn -> {});

        IngestionResult r = svc.ingest(tenantId, accountId, asStream(CSV));
        String fileName = ownerJdbc.queryForObject(
            "SELECT file_name FROM statements WHERE id = ?", String.class, r.statementId());
        assertThat(fileName).isEqualTo("statement.csv");
    }

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

    private static DataSource dataSource(String jdbcUrl, String user, String password) {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(jdbcUrl);
        ds.setUsername(user);
        ds.setPassword(password);
        return ds;
    }
}
