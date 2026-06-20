package com.ledgerline.platform.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * RLS isolation proof — the Spring-side evidence of the M5 multi-tenant
 * correctness floor. Java replica of the TS
 * {@code packages/db-client/src/verify-rls.ts} script, now an assertion-driven
 * integration test.
 *
 * <p>Runs against a real Postgres 16 (+pgvector) resolved by {@link TestPostgres}
 * — either an external alt-port instance or an ephemeral Testcontainer. It
 * applies all three Flyway migrations as the OWNER role, then:
 * <ol>
 *   <li>seeds two tenants + one account each (owner; per-tenant context because
 *       {@code accounts} is under FORCE RLS);</li>
 *   <li>connects as the NON-SUPERUSER {@code ledgerline_app} role and asserts:
 *     <ul>
 *       <li>tenant-A context sees exactly A's account;</li>
 *       <li>tenant-B context sees exactly B's account;</li>
 *       <li>an UNSCOPED connection sees ZERO accounts (fail-closed);</li>
 *       <li>an A-scoped connection CANNOT insert a B-stamped row (WITH CHECK).</li>
 *     </ul>
 *   </li>
 * </ol>
 *
 * <p>Why connect as {@code ledgerline_app}: superusers BYPASS RLS, and the
 * bootstrap user is a superuser. To OBSERVE enforcement we use the dedicated
 * non-superuser role that migration V1 creates.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RlsIsolationTest {

    private PostgreSQLContainer<?> container;   // null in external mode

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;
    private JdbcTemplate appJdbc;
    private TenantContext appTenantContext;

    private final java.util.List<UUID> seededTenants = new java.util.ArrayList<>();

    @BeforeAll
    void setUp() {
        final String ownerJdbcUrl;
        if (TestPostgres.usingExternal()) {
            ownerJdbcUrl = TestPostgres.externalJdbcUrl();
        } else {
            container = TestPostgres.newContainer();
            container.start();
            ownerJdbcUrl = container.getJdbcUrl();
        }

        // --- OWNER datasource: runs Flyway, seeds tenants, admin work ---
        DataSource ownerDs =
            dataSource(ownerJdbcUrl, TestPostgres.OWNER_USER, TestPostgres.OWNER_PASSWORD);
        Flyway.configure()
            .dataSource(ownerDs)
            .locations("classpath:db/migration")
            .baselineOnMigrate(true) // tolerate a pre-existing external DB
            .load()
            .migrate();
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        // --- APP-ROLE datasource: the non-superuser ledgerline_app from V1 ---
        DataSource appDs =
            dataSource(ownerJdbcUrl, TestPostgres.APP_USER, TestPostgres.APP_PASSWORD);
        this.appJdbc = new JdbcTemplate(appDs);
        this.appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
    }

    @AfterAll
    void tearDown() {
        // External DB persists across runs, so remove our seed rows (cascades to
        // accounts). Harmless no-op in Testcontainers mode.
        if (ownerJdbc != null && !seededTenants.isEmpty()) {
            for (UUID t : seededTenants) {
                ownerJdbc.update("DELETE FROM tenants WHERE id = ?", t);
            }
        }
        if (container != null) {
            container.stop();
        }
    }

    private DataSource dataSource(String url, String user, String password) {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(url);
        ds.setUsername(user);
        ds.setPassword(password);
        return ds;
    }

    @Test
    void rls_isolates_tenants_for_the_app_role() {
        // ---- Step 1: owner seeds two tenants (tenants table is NOT under RLS) ----
        UUID tenantA = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class, "RLS Test Tenant A");
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class, "RLS Test Tenant B");
        seededTenants.add(tenantA);
        seededTenants.add(tenantB);
        assertThat(tenantA).isNotNull();
        assertThat(tenantB).isNotNull();

        // accounts is under FORCE RLS, so even the owner must set context to insert.
        ownerTenantContext.withTenant(tenantA, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (?, ?, ?::account_type, ?)",
                tenantA, "HDFC Bank", "savings", "XXXX1111"));
        ownerTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                    + "VALUES (?, ?, ?::account_type, ?)",
                tenantB, "ICICI Bank", "current", "XXXX2222"));

        // ---- Step 2: app role scoped to A -> sees ONLY A's account ----
        List<UUID> seenByA = appTenantContext.withTenant(tenantA, (JdbcTemplate jdbc) ->
            jdbc.queryForList(
                "SELECT tenant_id FROM accounts WHERE masked_number IN ('XXXX1111','XXXX2222')",
                UUID.class));
        assertThat(seenByA)
            .as("tenant A sees exactly its own seeded account")
            .containsExactly(tenantA);

        // ---- Step 3: app role scoped to B -> sees ONLY B's account ----
        List<UUID> seenByB = appTenantContext.withTenant(tenantB, (JdbcTemplate jdbc) ->
            jdbc.queryForList(
                "SELECT tenant_id FROM accounts WHERE masked_number IN ('XXXX1111','XXXX2222')",
                UUID.class));
        assertThat(seenByB)
            .as("tenant B sees exactly its own seeded account")
            .containsExactly(tenantB);

        // ---- Step 4: no tenant context set -> ZERO rows (fail-closed default) ----
        Long unscopedCount =
            appJdbc.queryForObject("SELECT count(*) FROM accounts", Long.class);
        assertThat(unscopedCount)
            .as("un-scoped app connection sees ZERO accounts (fail-closed)")
            .isZero();

        // ---- Step 5: WITH CHECK — A-scoped connection cannot write a B-stamped row ----
        assertThatThrownBy(() ->
            appTenantContext.withTenant(tenantA, (JdbcTemplate jdbc) ->
                jdbc.update(
                    "INSERT INTO accounts (tenant_id, institution, account_type, masked_number) "
                        + "VALUES (?, ?, ?::account_type, ?)",
                    tenantB, "Evil Bank", "other", "XXXX9999")))
            .as("scoped-to-A connection CANNOT insert a row stamped tenant B (WITH CHECK)")
            .isInstanceOf(Exception.class);
    }
}
