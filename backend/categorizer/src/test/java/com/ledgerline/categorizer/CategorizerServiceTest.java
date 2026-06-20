package com.ledgerline.categorizer;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.platform.db.TenantContext;
import java.util.Optional;
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
 * M11 — happy-path + invariant tests for {@link CategorizerService}.
 *
 * <p>Dual-mode harness mirroring {@code LedgerServiceTest} /
 * {@code IngestionServiceTest}: external alt-port Postgres via
 * {@code TEST_DATABASE_URL} if set, else an ephemeral Testcontainers
 * pgvector/pgvector:pg16. Either way the SUT runs under the non-superuser
 * {@code ledgerline_app} role so RLS is real.
 *
 * <p>Covers the rule-evaluation contract:
 * <ul>
 *   <li>priority precedence (lower number wins);</li>
 *   <li>{@code enabled=false} rules are ignored;</li>
 *   <li>each {@code pattern_kind} variant works correctly;</li>
 *   <li>no match returns empty; all-disabled returns empty;</li>
 *   <li>a malformed regex rule is skipped without aborting evaluation;</li>
 *   <li>RLS scopes the visible rule set per tenant.</li>
 * </ul>
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CategorizerServiceTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private PostgreSQLContainer<?> container;

    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;

    private CategorizerService categorizer;

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
        TenantContext appTenantContext =
            new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        this.categorizer = new CategorizerService(appTenantContext);
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

    @BeforeEach
    void freshTenant() {
        tenantId = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M11 Cat Test Tenant " + UUID.randomUUID());
        seededTenants.add(tenantId);
    }

    // ---------------------------------------------------------------------
    // 1. No rules / no match
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("no rules: match returns empty")
    void no_rules_returns_empty() {
        Optional<UUID> result = categorizer.match(tenantId, "UPI/SWIGGY/abc", null);
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("no rule matches: returns empty")
    void no_match_returns_empty() {
        UUID groceries = seedCategory("Groceries");
        seedRule(tenantId, "contains", "ZOMATO", groceries, 100, true);

        Optional<UUID> result = categorizer.match(tenantId, "UPI/SWIGGY/abc", null);
        assertThat(result).isEmpty();
    }

    // ---------------------------------------------------------------------
    // 2. Priority precedence
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("priority precedence: lower priority number wins on overlapping match")
    void lower_priority_wins() {
        UUID food   = seedCategory("Food");
        UUID dining = seedCategory("Dining");

        // Both rules would match "UPI/SWIGGY/abc". The priority=10 wins over priority=100.
        seedRule(tenantId, "contains", "SWIGGY", food,   100, true);
        seedRule(tenantId, "contains", "SWIGGY", dining,  10, true);

        Optional<UUID> result = categorizer.match(tenantId, "UPI/SWIGGY/abc", null);
        assertThat(result).contains(dining);
    }

    @Test
    @DisplayName("enabled=false rules are ignored even if they would otherwise win")
    void disabled_rules_ignored() {
        UUID food   = seedCategory("Food");
        UUID dining = seedCategory("Dining");

        // The high-priority dining rule is disabled, so the lower-priority food rule wins.
        seedRule(tenantId, "contains", "SWIGGY", dining, 10,  false);
        seedRule(tenantId, "contains", "SWIGGY", food,   100, true);

        Optional<UUID> result = categorizer.match(tenantId, "UPI/SWIGGY/abc", null);
        assertThat(result).contains(food);
    }

    @Test
    @DisplayName("all rules disabled: returns empty")
    void all_disabled_returns_empty() {
        UUID groceries = seedCategory("Groceries");
        seedRule(tenantId, "contains", "BIGBAZAAR", groceries, 10,  false);
        seedRule(tenantId, "contains", "BIGBAZAAR", groceries, 100, false);

        Optional<UUID> result = categorizer.match(tenantId, "UPI/BIGBAZAAR/xyz", null);
        assertThat(result).isEmpty();
    }

    // ---------------------------------------------------------------------
    // 3. Pattern-kind variants
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("contains: case-insensitive substring match")
    void contains_is_case_insensitive_substring() {
        UUID groceries = seedCategory("Groceries");
        seedRule(tenantId, "contains", "bigbazaar", groceries, 100, true);

        // Different casing on input — still matches.
        assertThat(categorizer.match(tenantId, "UPI/BIGBAZAAR/123", null)).contains(groceries);
        assertThat(categorizer.match(tenantId, "Upi/BigBazaar/xyz", null)).contains(groceries);
        // No occurrence — does not match.
        assertThat(categorizer.match(tenantId, "UPI/SWIGGY", null)).isEmpty();
    }

    @Test
    @DisplayName("equals: case-insensitive EXACT match (no substring)")
    void equals_is_case_insensitive_exact() {
        UUID rent = seedCategory("Rent");
        seedRule(tenantId, "equals", "RENT MAY 2026", rent, 100, true);

        // Exact (different case) matches.
        assertThat(categorizer.match(tenantId, "rent may 2026", null)).contains(rent);
        // Substring does NOT match for equals.
        assertThat(categorizer.match(tenantId, "RENT MAY 2026 PAID", null)).isEmpty();
    }

    @Test
    @DisplayName("regex: case-insensitive, anchored as the rule writes it")
    void regex_case_insensitive() {
        UUID transport = seedCategory("Transport");
        seedRule(tenantId, "regex", "^UPI/(UBER|OLA)/", transport, 100, true);

        assertThat(categorizer.match(tenantId, "UPI/UBER/trip-123", null)).contains(transport);
        assertThat(categorizer.match(tenantId, "upi/ola/abc",       null)).contains(transport);
        assertThat(categorizer.match(tenantId, "UPI/RAPIDO/foo",    null)).isEmpty();
    }

    @Test
    @DisplayName("merchant field also participates in matching when rawDescription doesn't")
    void merchant_field_is_evaluated() {
        UUID groceries = seedCategory("Groceries");
        seedRule(tenantId, "contains", "BigBazaar", groceries, 100, true);

        // rawDescription is opaque; the canonicalised merchant is what carries the brand.
        assertThat(categorizer.match(tenantId, "POS-29384172", "BigBazaar Mumbai"))
            .contains(groceries);
    }

    // ---------------------------------------------------------------------
    // 4. Bad-regex defensiveness
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("bad regex rule is skipped; subsequent rules still evaluate")
    void bad_regex_is_skipped_not_fatal() {
        UUID food   = seedCategory("Food");
        UUID dining = seedCategory("Dining");

        // Priority 10 has an unclosed group — Pattern.compile throws.
        seedRule(tenantId, "regex", "(unclosed", dining, 10, true);
        // Priority 100 is the fallback that should still get its turn.
        seedRule(tenantId, "contains", "SWIGGY", food, 100, true);

        Optional<UUID> result = categorizer.match(tenantId, "UPI/SWIGGY/abc", null);
        assertThat(result).contains(food);
    }

    // ---------------------------------------------------------------------
    // 5. Tenant isolation on rule visibility (RLS)
    // ---------------------------------------------------------------------

    @Test
    @DisplayName("rules are visible only to their own tenant context")
    void tenant_isolation_on_rules() {
        UUID tenantA = tenantId;
        UUID tenantB = ownerJdbc.queryForObject(
            "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
            UUID.class,
            "M11 Cat Tenant B " + UUID.randomUUID());
        seededTenants.add(tenantB);

        UUID groceriesA = seedCategory(tenantA, "Groceries");
        seedRule(tenantA, "contains", "BIGBAZAAR", groceriesA, 100, true);

        // Tenant A sees its rule.
        assertThat(categorizer.match(tenantA, "UPI/BIGBAZAAR/123", null))
            .contains(groceriesA);

        // Tenant B does NOT see tenant A's rule.
        assertThat(categorizer.match(tenantB, "UPI/BIGBAZAAR/123", null))
            .isEmpty();
    }

    // ---------------------------------------------------------------------
    // helpers
    // ---------------------------------------------------------------------

    private UUID seedCategory(String name) {
        return seedCategory(tenantId, name);
    }

    private UUID seedCategory(UUID tenantId, String name) {
        return ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "INSERT INTO categories (tenant_id, name, kind) "
                    + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "        ?, 'expense'::category_kind) "
                    + "RETURNING id",
                UUID.class,
                name));
    }

    private void seedRule(UUID tenantId, String kind, String pattern, UUID categoryId,
                          int priority, boolean enabled) {
        ownerTenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.update(
                "INSERT INTO categorization_rules "
                    + "(tenant_id, pattern_kind, pattern, category_id, priority, enabled) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?::rule_pattern_kind, ?, ?, ?, ?"
                    + ")",
                kind, pattern, categoryId, priority, enabled));
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
