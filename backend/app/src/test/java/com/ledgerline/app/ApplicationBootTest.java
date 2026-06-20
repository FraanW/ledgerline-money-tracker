package com.ledgerline.app;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import com.ledgerline.platform.db.TenantContext;

/**
 * Proves the application boots end to end against a real Postgres: the Spring
 * context starts, the DataSource auto-configures, Flyway applies the migrations
 * (V1-V3), and the {@link TenantContext} bean from the platform-db module is
 * wired in.
 *
 * <p>Dual-mode datasource, same as {@code RlsIsolationTest}:
 * <ul>
 *   <li>External alt-port mode if {@code -Dledgerline.test.jdbc-url} /
 *       {@code TEST_DATABASE_URL} is set (the path used on this machine);</li>
 *   <li>otherwise an ephemeral Testcontainer (CI default).</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApplicationBootTest {

    private static final PostgreSQLContainer<?> PG;

    static {
        String external = externalJdbcUrl();
        if (external == null) {
            PG = new PostgreSQLContainer<>(DockerImageName.parse("pgvector/pgvector:pg16"))
                .withDatabaseName("ledgerline")
                .withUsername("ledgerline")
                .withPassword("ledgerline");
            PG.start();
        } else {
            PG = null;
        }
    }

    private static String externalJdbcUrl() {
        String prop = System.getProperty("ledgerline.test.jdbc-url");
        if (prop != null && !prop.isBlank()) {
            return prop;
        }
        String env = System.getenv("TEST_DATABASE_URL");
        return (env != null && !env.isBlank()) ? env : null;
    }

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        String external = externalJdbcUrl();
        if (external != null) {
            registry.add("spring.datasource.url", () -> external);
            registry.add("spring.datasource.username", () -> "ledgerline");
            registry.add("spring.datasource.password", () -> "ledgerline");
            // External DB may already carry Flyway history from RlsIsolationTest.
            registry.add("spring.flyway.baseline-on-migrate", () -> "true");
        } else {
            registry.add("spring.datasource.url", PG::getJdbcUrl);
            registry.add("spring.datasource.username", PG::getUsername);
            registry.add("spring.datasource.password", PG::getPassword);
        }
    }

    @Autowired
    private TenantContext tenantContext;

    @Autowired
    private DataSource dataSource;

    @Test
    void context_loads_and_flyway_applied_all_migrations() {
        assertThat(tenantContext).as("platform-db TenantContext is wired").isNotNull();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // Flyway recorded our three migrations (V1-V3) as successful.
        Integer appliedV1toV3 = jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history "
                + "WHERE success = true AND version IN ('1','2','3')",
            Integer.class);
        assertThat(appliedV1toV3).isEqualTo(3);

        // The schema exists: the accounts table is present.
        Integer accountsTable = jdbc.queryForObject(
            "SELECT count(*) FROM information_schema.tables "
                + "WHERE table_schema = 'public' AND table_name = 'accounts'",
            Integer.class);
        assertThat(accountsTable).isEqualTo(1);

        // RLS is FORCED on a tenant table (the correctness floor is live).
        Boolean forced = jdbc.queryForObject(
            "SELECT relforcerowsecurity FROM pg_class WHERE relname = 'accounts'",
            Boolean.class);
        assertThat(forced).isTrue();

        // The non-superuser app role was created by V1.
        Integer appRole = jdbc.queryForObject(
            "SELECT count(*) FROM pg_roles WHERE rolname = 'ledgerline_app'", Integer.class);
        assertThat(appRole).isEqualTo(1);
    }
}
