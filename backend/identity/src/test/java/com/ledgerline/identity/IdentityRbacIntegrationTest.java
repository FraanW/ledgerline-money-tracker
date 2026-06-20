package com.ledgerline.identity;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * V7/V8/V9 — integration tests for the identity layer + data-driven RBAC.
 *
 * <p>Dual-mode harness mirroring {@code CategorizerServiceTest} /
 * {@code IngestionConcurrencyTest}: external alt-port Postgres via
 * {@code TEST_DATABASE_URL} if set, else an ephemeral Testcontainers
 * pgvector/pgvector:pg16.
 *
 * <p>The wiring is deliberately split by privilege, mirroring production:
 * <ul>
 *   <li>{@link IdentityService}'s control-plane phases run on the OWNER
 *       connection (users provisioning has no app-role INSERT grant — by
 *       design, V7);</li>
 *   <li>its tenant-scoped phase (tenant_settings + bootstrap membership) and
 *       ALL RBAC checks run through the non-superuser {@code ledgerline_app}
 *       role, so the V7/V8/V9 RLS policies are exercised for real.</li>
 * </ul>
 *
 * <p>Covers: idempotent provisioning; workspace bootstrap (tenant + settings
 * + first owner membership); the seeded role→permission matrix under the app
 * role; the dual GUCs; users self/co-member visibility; user_settings
 * self-only visibility.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class IdentityRbacIntegrationTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container;

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;
    private TenantContext appTenantContext;

    private IdentityService identity;
    private RbacService rbac;

    @BeforeAll
    void setUp() throws InterruptedException {
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
        // In external mode, gradle's PARALLEL module test tasks share one DB.
        // Another suite's Flyway can have just created an EMPTY history table,
        // which makes baselineOnMigrate fail spuriously ("exists, and is
        // empty") — retry briefly; once the winner finishes, migrate no-ops.
        org.flywaydb.core.api.FlywayException lastFlywayFailure = null;
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                Flyway.configure()
                    .dataSource(ownerDs)
                    .locations("classpath:db/migration")
                    .baselineOnMigrate(true)
                    .load()
                    .migrate();
                lastFlywayFailure = null;
                break;
            } catch (org.flywaydb.core.api.FlywayException raced) {
                lastFlywayFailure = raced;
                Thread.sleep(2000);
            }
        }
        if (lastFlywayFailure != null) {
            throw lastFlywayFailure;
        }
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        this.appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);

        // Control plane on the owner connection; tenant-scoped phase under the
        // APP role — proves workspace bootstrap survives real RLS.
        this.identity = new IdentityService(
            new DataSourceTransactionManager(ownerDs), ownerDs, appTenantContext);
        this.rbac = new RbacService(appTenantContext);
    }

    @AfterAll
    void tearDown() {
        if (ownerJdbc != null) {
            // Tenants cascade their tenant-scoped rows; users are global.
            ownerJdbc.update("DELETE FROM tenants WHERE display_name LIKE 'IdRbac %'");
            ownerJdbc.update("DELETE FROM users WHERE email LIKE '%@idrbac.test'");
        }
        if (container != null) {
            container.stop();
        }
    }

    // =====================================================================
    // 1. Provisioning
    // =====================================================================

    @Test
    @DisplayName("provisionUser is idempotent by email: same id back, auth_subject linked once, exactly one settings row")
    void provision_is_idempotent() {
        UUID first = identity.provisionUser(null, "anaya@idrbac.test", "Anaya");
        UUID authSubject = UUID.randomUUID();
        UUID second = identity.provisionUser(authSubject, "anaya@idrbac.test", "Anaya S");

        assertThat(second).isEqualTo(first);

        // auth_subject was linked by the second call (COALESCE keeps it stable after that).
        UUID linked = ownerJdbc.queryForObject(
            "SELECT auth_subject FROM users WHERE id = ?", UUID.class, first);
        assertThat(linked).isEqualTo(authSubject);

        Integer settingsRows = ownerJdbc.queryForObject(
            "SELECT count(*) FROM user_settings WHERE user_id = ?", Integer.class, first);
        assertThat(settingsRows).isEqualTo(1);

        // Default persona is the schema default.
        String theme = ownerJdbc.queryForObject(
            "SELECT preferred_theme::text FROM user_settings WHERE user_id = ?",
            String.class, first);
        assertThat(theme).isEqualTo("millennial");
    }

    // =====================================================================
    // 2. Workspace bootstrap
    // =====================================================================

    @Test
    @DisplayName("createWorkspace: tenant + tenant_settings + first owner membership, all present; listMemberships sees it")
    void create_workspace_bootstraps_everything() {
        UUID owner = identity.provisionUser(null, "owner@idrbac.test", "Owner");
        UUID tenant = identity.createWorkspace(owner, "IdRbac Workspace");

        Integer settings = ownerJdbc.queryForObject(
            "SELECT count(*) FROM tenant_settings WHERE tenant_id = ?", Integer.class, tenant);
        assertThat(settings).isEqualTo(1);

        String roleKey = ownerJdbc.queryForObject(
            """
            SELECT r.key FROM memberships m JOIN roles r ON r.id = m.role_id
            WHERE m.user_id = ? AND m.tenant_id = ?
            """,
            String.class, owner, tenant);
        assertThat(roleKey).isEqualTo("owner");

        List<MembershipView> memberships = identity.listMemberships(owner);
        assertThat(memberships)
            .anySatisfy(m -> {
                assertThat(m.tenantId()).isEqualTo(tenant);
                assertThat(m.tenantName()).isEqualTo("IdRbac Workspace");
                assertThat(m.role()).isEqualTo("owner");
                assertThat(m.status()).isEqualTo("active");
            });
    }

    // =====================================================================
    // 3. The RBAC matrix, under the real app role
    // =====================================================================

    @Test
    @DisplayName("seeded matrix: owner gets everything; viewer reads but cannot write; non-member gets nothing")
    void rbac_matrix_enforced_under_app_role() {
        UUID owner = identity.provisionUser(null, "matrix-owner@idrbac.test", "Owner");
        UUID viewer = identity.provisionUser(null, "matrix-viewer@idrbac.test", "Viewer");
        UUID stranger = identity.provisionUser(null, "matrix-stranger@idrbac.test", "Stranger");
        UUID tenant = identity.createWorkspace(owner, "IdRbac Matrix");

        addMembership(tenant, viewer, "viewer");

        // owner: full matrix incl. the owner-only key.
        assertThat(rbac.hasPermission(owner, tenant, "statement:write")).isTrue();
        assertThat(rbac.hasPermission(owner, tenant, "member:manage")).isTrue();
        assertThat(rbac.hasPermission(owner, tenant, "tenant:manage")).isTrue();

        // viewer: reads yes, writes/manage no.
        assertThat(rbac.hasPermission(viewer, tenant, "transaction:read")).isTrue();
        assertThat(rbac.hasPermission(viewer, tenant, "statement:read")).isTrue();
        assertThat(rbac.hasPermission(viewer, tenant, "statement:write")).isFalse();
        assertThat(rbac.hasPermission(viewer, tenant, "member:manage")).isFalse();

        // non-member: nothing, and requirePermission throws the 403 carrier.
        assertThat(rbac.hasPermission(stranger, tenant, "transaction:read")).isFalse();
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> rbac.requirePermission(stranger, tenant, "transaction:read"))
            .isInstanceOf(RbacException.Forbidden.class);

        // unknown permission key: fail closed even for the owner.
        assertThat(rbac.hasPermission(owner, tenant, "no:such-permission")).isFalse();
    }

    // =====================================================================
    // 4. The dual GUCs + RLS visibility
    // =====================================================================

    @Test
    @DisplayName("withTenantAndUser exposes BOTH GUCs inside the transaction")
    void dual_gucs_are_live() {
        UUID owner = identity.provisionUser(null, "guc@idrbac.test", "Guc");
        UUID tenant = identity.createWorkspace(owner, "IdRbac Guc");

        String[] seen = appTenantContext.withTenantAndUser(tenant, owner, (JdbcTemplate jdbc) ->
            new String[]{
                jdbc.queryForObject("SELECT current_setting('app.current_tenant', true)", String.class),
                jdbc.queryForObject("SELECT current_setting('app.current_user_id', true)", String.class)
            });
        assertThat(seen[0]).isEqualTo(tenant.toString());
        assertThat(seen[1]).isEqualTo(owner.toString());
    }

    @Test
    @DisplayName("users RLS under the app role: self + co-members visible, strangers invisible")
    void users_visibility_is_self_or_comember() {
        UUID a = identity.provisionUser(null, "vis-a@idrbac.test", "A");
        UUID b = identity.provisionUser(null, "vis-b@idrbac.test", "B");
        UUID c = identity.provisionUser(null, "vis-c@idrbac.test", "C");
        UUID tenant = identity.createWorkspace(a, "IdRbac Vis");
        addMembership(tenant, b, "viewer");
        // c gets NO membership anywhere near this tenant.

        Integer seesA = countUserVisible(tenant, a, a);
        Integer seesB = countUserVisible(tenant, a, b);
        Integer seesC = countUserVisible(tenant, a, c);

        assertThat(seesA).as("self is visible").isEqualTo(1);
        assertThat(seesB).as("co-member is visible").isEqualTo(1);
        assertThat(seesC).as("stranger is invisible").isZero();
    }

    @Test
    @DisplayName("user_settings RLS: a user-scoped transaction sees exactly their own row")
    void user_settings_is_self_only() {
        UUID a = identity.provisionUser(null, "set-a@idrbac.test", "A");
        identity.provisionUser(null, "set-b@idrbac.test", "B");

        Integer visible = appTenantContext.withUser(a, (JdbcTemplate jdbc) ->
            jdbc.queryForObject("SELECT count(*) FROM user_settings", Integer.class));
        assertThat(visible).as("only the acting user's settings row is visible").isEqualTo(1);

        UUID visibleUserId = appTenantContext.withUser(a, (JdbcTemplate jdbc) ->
            jdbc.queryForObject("SELECT user_id FROM user_settings", UUID.class));
        assertThat(visibleUserId).isEqualTo(a);
    }

    // =====================================================================
    // helpers
    // =====================================================================

    /** Count how many rows of `users` with this id the acting user can see. */
    private Integer countUserVisible(UUID tenant, UUID actingUser, UUID targetUser) {
        return appTenantContext.withTenantAndUser(tenant, actingUser, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "SELECT count(*) FROM users WHERE id = ?", Integer.class, targetUser));
    }

    /** Insert a membership at the given SYSTEM role, under the app role's RLS. */
    private void addMembership(UUID tenant, UUID user, String roleKey) {
        UUID roleId = ownerJdbc.queryForObject(
            "SELECT id FROM roles WHERE tenant_id IS NULL AND key = ?", UUID.class, roleKey);
        appTenantContext.withTenant(tenant, (JdbcTemplate jdbc) -> {
            jdbc.update(
                """
                INSERT INTO memberships (user_id, tenant_id, role_id, status)
                VALUES (?, ?, ?, 'active'::membership_status)
                """,
                user, tenant, roleId);
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

    private static DataSource dataSource(String jdbcUrl, String user, String password) {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(jdbcUrl);
        ds.setUsername(user);
        ds.setPassword(password);
        return ds;
    }
}
