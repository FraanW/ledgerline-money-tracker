package com.ledgerline.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.identity.IdentityService;
import com.ledgerline.identity.RbacExceptionAdvice;
import com.ledgerline.identity.RbacService;
import com.ledgerline.ledger.LedgerService;
import com.ledgerline.platform.db.TenantContext;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Sweep 2 — the :api surface, end to end through MockMvc with REAL services
 * against a REAL database (dual-mode harness; SUT runs under the
 * non-superuser {@code ledgerline_app} role so RLS is live).
 *
 * <p>Walks the app's actual loop: workspace → account → category+rule →
 * income → envelope → allocate → budget view → transactions feed → settings
 * (persona persists!) → holdings/networth/goals CRUD → RBAC (viewer can read,
 * cannot write) → the 422 never-negative refusal.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class ApiIntegrationTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private static final ObjectMapper JSON = new ObjectMapper();

    private PostgreSQLContainer<?> container;
    private JdbcTemplate ownerJdbc;
    private TenantContext ownerTenantContext;

    private MockMvc mvc;

    private UUID owner;
    private UUID viewer;
    private UUID tenant;
    private UUID accountId;
    private UUID categoryId;
    private UUID envelopeId;

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
        migrateWithRetry(ownerDs);
        this.ownerJdbc = new JdbcTemplate(ownerDs);
        this.ownerTenantContext =
            new TenantContext(new DataSourceTransactionManager(ownerDs), ownerDs);

        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        TenantContext appCtx = new TenantContext(new DataSourceTransactionManager(appDs), appDs);

        // Real services over the app role; identity's control plane on owner.
        IdentityService identity = new IdentityService(
            new DataSourceTransactionManager(ownerDs), ownerDs, appCtx);
        RbacService rbac = new RbacService(appCtx);
        LedgerService ledger = new LedgerService(appCtx);
        // No Supabase in this suite: blank url → bearer refused, dev headers on.
        ApiGate gate = new ApiGate(rbac,
            new com.ledgerline.identity.ActingUserResolver("", true, identity));

        this.mvc = MockMvcBuilders.standaloneSetup(
                new TransactionsController(gate, appCtx),
                new BudgetController(gate, appCtx, ledger),
                new StatementsController(gate, appCtx),
                new AccountsController(gate, appCtx),
                new TaxonomyController(gate, appCtx),
                new SettingsController(gate, appCtx),
                new HoldingsController(gate, appCtx),
                new NetWorthController(gate, appCtx),
                new GoalsController(gate, appCtx))
            .setControllerAdvice(new ApiExceptionAdvice(), new RbacExceptionAdvice())
            .build();

        // The world: a household with an owner and a read-only viewer.
        owner = identity.provisionUser(null, "api-owner@api.test", "Owner");
        viewer = identity.provisionUser(null, "api-viewer@api.test", "Viewer");
        tenant = identity.createWorkspace(owner, "Api Household");
        UUID viewerRole = ownerJdbc.queryForObject(
            "SELECT id FROM roles WHERE tenant_id IS NULL AND key = 'viewer'", UUID.class);
        ownerJdbc.update(
            "INSERT INTO memberships (user_id, tenant_id, role_id, status) VALUES (?, ?, ?, 'active')",
            viewer, tenant, viewerRole);
    }

    @AfterAll
    void tearDown() {
        if (ownerJdbc != null) {
            ownerJdbc.update("DELETE FROM tenants WHERE display_name = 'Api Household'");
            ownerJdbc.update("DELETE FROM users WHERE email LIKE '%@api.test'");
        }
        if (container != null) {
            container.stop();
        }
    }

    // =====================================================================

    @Test
    @Order(1)
    @DisplayName("accounts: POST creates, GET lists")
    void accounts_roundtrip() throws Exception {
        MvcResult created = mvc.perform(post("/api/v0/accounts")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"institution\":\"HDFC Bank\",\"accountType\":\"savings\",\"maskedNumber\":\"XXXX4821\"}"))
            .andExpect(status().isOk())
            .andReturn();
        accountId = UUID.fromString(json(created).get("accountId").asText());

        mvc.perform(get("/api/v0/accounts").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].institution").value("HDFC Bank"));
    }

    @Test
    @Order(2)
    @DisplayName("taxonomy: category + rule CRUD")
    void taxonomy_roundtrip() throws Exception {
        MvcResult cat = mvc.perform(post("/api/v0/categories")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"name\":\"Dining\",\"kind\":\"expense\"}"))
            .andExpect(status().isOk())
            .andReturn();
        categoryId = UUID.fromString(json(cat).get("categoryId").asText());

        MvcResult rule = mvc.perform(post("/api/v0/rules")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"patternKind\":\"contains\",\"pattern\":\"SWIGGY\",\"categoryId\":\"" + categoryId + "\",\"priority\":10}"))
            .andExpect(status().isOk())
            .andReturn();
        String ruleId = json(rule).get("ruleId").asText();

        mvc.perform(get("/api/v0/rules").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].pattern").value("SWIGGY"));

        mvc.perform(put("/api/v0/rules/" + ruleId)
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"patternKind\":\"contains\",\"pattern\":\"SWIGGY\",\"categoryId\":\"" + categoryId + "\",\"priority\":5,\"enabled\":false}"))
            .andExpect(status().isOk());

        mvc.perform(delete("/api/v0/rules/" + ruleId).headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(true));
    }

    @Test
    @Order(3)
    @DisplayName("budget loop: income → envelope → allocate → view reflects every move; over-allocate → 422")
    void budget_loop() throws Exception {
        // ₹50,000 arrives.
        mvc.perform(post("/api/v0/budget/income")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"amountMinor\":5000000,\"description\":\"salary\"}"))
            .andExpect(status().isOk());

        // A Dining envelope for June 2026, anchored to the category.
        MvcResult env = mvc.perform(post("/api/v0/budget/envelopes")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"name\":\"Dining\",\"period\":\"2026-06\",\"categoryId\":\"" + categoryId + "\"}"))
            .andExpect(status().isOk())
            .andReturn();
        envelopeId = UUID.fromString(json(env).get("envelopeId").asText());

        // Fund it with ₹8,000 from Unallocated.
        mvc.perform(post("/api/v0/budget/allocate")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"toEnvelopeId\":\"" + envelopeId + "\",\"amountMinor\":800000}"))
            .andExpect(status().isOk());

        // The view adds up.
        mvc.perform(get("/api/v0/budget").headers(asOwner()).param("period", "2026-06"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.envelopes[0].name").value("Dining"))
            .andExpect(jsonPath("$.envelopes[0].balanceMinor").value(800000))
            .andExpect(jsonPath("$.unallocatedMinor").value(4200000));

        // NOTE: allocating beyond Unallocated's balance is ALLOWED by design —
        // pseudo envelopes are exempt from never-negative (V4), so over-
        // budgeting stays visible instead of blocked. The floor protects USER
        // envelopes: draining Dining (₹8,000) beyond its balance → 422.
        MvcResult fun = mvc.perform(post("/api/v0/budget/envelopes")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"name\":\"Fun\",\"period\":\"2026-06\"}"))
            .andExpect(status().isOk())
            .andReturn();
        String funId = json(fun).get("envelopeId").asText();

        mvc.perform(post("/api/v0/budget/allocate")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"fromEnvelopeId\":\"" + envelopeId + "\",\"toEnvelopeId\":\"" + funId
                    + "\",\"amountMinor\":999999999}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("would_go_negative"));
    }

    @Test
    @Order(4)
    @DisplayName("transactions feed: filters + paging shapes")
    void transactions_feed() throws Exception {
        // Seed two transactions directly (ingestion is covered in its module).
        ownerTenantContext.withTenant(tenant, (JdbcTemplate jdbc) -> {
            jdbc.update(
                """
                INSERT INTO transactions (tenant_id, account_id, posted_at, amount_minor, currency,
                                          direction, raw_description, category_id, source, dedup_hash)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?, '2026-06-04', 25000, 'INR', 'debit', 'UPI/SWIGGY/881', ?, 'statement_upload', 'h1'),
                       (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?, '2026-06-01', 8200000, 'INR', 'credit', 'NEFT SALARY', NULL, 'statement_upload', 'h2')
                """,
                accountId, categoryId, accountId);
        });

        mvc.perform(get("/api/v0/transactions").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(2))
            .andExpect(jsonPath("$.items[0].rawDescription").value("UPI/SWIGGY/881"))
            .andExpect(jsonPath("$.items[0].amount.minor").value(25000));

        mvc.perform(get("/api/v0/transactions").headers(asOwner()).param("q", "salary"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1))
            .andExpect(jsonPath("$.items[0].direction").value("credit"));

        mvc.perform(get("/api/v0/transactions").headers(asOwner()).param("categoryId", categoryId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    @Order(5)
    @DisplayName("user settings: default → PUT persona → persists (the persona finally survives a reload)")
    void user_settings_persona_persists() throws Exception {
        mvc.perform(get("/api/v0/settings/user").header("X-User-Id", owner.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.preferredTheme").value("millennial"));

        mvc.perform(put("/api/v0/settings/user")
                .header("X-User-Id", owner.toString())
                .contentType("application/json")
                .content("{\"preferredTheme\":\"genz\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.preferredTheme").value("genz"));

        mvc.perform(get("/api/v0/settings/user").header("X-User-Id", owner.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.preferredTheme").value("genz"));
    }

    @Test
    @Order(6)
    @DisplayName("portfolio CRUD: holdings + networth totals + goals")
    void portfolio_crud() throws Exception {
        mvc.perform(post("/api/v0/holdings")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"name\":\"Nifty 50 Index\",\"kind\":\"index\",\"investedMinor\":25000000,\"valueMinor\":32200000,\"expenseRatioBps\":20}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v0/holdings").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].kind").value("index"));

        mvc.perform(post("/api/v0/networth")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"itemType\":\"asset\",\"name\":\"Emergency fund\",\"amountMinor\":15000000,\"incomeGenerating\":false}"))
            .andExpect(status().isOk());
        mvc.perform(post("/api/v0/networth")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"itemType\":\"liability\",\"name\":\"Phone EMI\",\"amountMinor\":1500000}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v0/networth").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totals.assetsMinor").value(15000000))
            .andExpect(jsonPath("$.totals.liabilitiesMinor").value(1500000))
            .andExpect(jsonPath("$.totals.netMinor").value(13500000));

        mvc.perform(post("/api/v0/goals")
                .headers(asOwner())
                .contentType("application/json")
                .content("{\"name\":\"Goa Trip\",\"targetMinor\":6000000,\"currentMinor\":2400000}"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v0/goals").headers(asOwner()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].name").value("Goa Trip"));
    }

    @Test
    @Order(7)
    @DisplayName("RBAC through HTTP: viewer reads everything, writes nothing")
    void rbac_viewer_reads_but_cannot_write() throws Exception {
        mvc.perform(get("/api/v0/transactions").headers(asViewer()))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v0/budget").headers(asViewer()).param("period", "2026-06"))
            .andExpect(status().isOk());
        mvc.perform(get("/api/v0/holdings").headers(asViewer()))
            .andExpect(status().isOk());

        mvc.perform(post("/api/v0/budget/income")
                .headers(asViewer())
                .contentType("application/json")
                .content("{\"amountMinor\":100}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.permission").value("envelope:write"));

        mvc.perform(post("/api/v0/holdings")
                .headers(asViewer())
                .contentType("application/json")
                .content("{\"name\":\"X\",\"kind\":\"gold\",\"investedMinor\":1,\"valueMinor\":1}"))
            .andExpect(status().isForbidden());
    }

    @Test
    @Order(8)
    @DisplayName("missing identity headers → 400, never a 500")
    void missing_headers_are_400() throws Exception {
        mvc.perform(get("/api/v0/transactions"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("missing X-Tenant-Id header"));
        mvc.perform(get("/api/v0/settings/user"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("missing X-User-Id header"));
    }

    // =====================================================================
    // helpers
    // =====================================================================

    private org.springframework.http.HttpHeaders asOwner() {
        return headers(owner);
    }

    private org.springframework.http.HttpHeaders asViewer() {
        return headers(viewer);
    }

    private org.springframework.http.HttpHeaders headers(UUID user) {
        org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.set("X-Tenant-Id", tenant.toString());
        h.set("X-User-Id", user.toString());
        return h;
    }

    private static JsonNode json(MvcResult result) throws Exception {
        return JSON.readTree(result.getResponse().getContentAsString());
    }

    private static void migrateWithRetry(DataSource ownerDs) throws InterruptedException {
        org.flywaydb.core.api.FlywayException last = null;
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                Flyway.configure()
                    .dataSource(ownerDs)
                    .locations("classpath:db/migration")
                    .baselineOnMigrate(true)
                    .load()
                    .migrate();
                last = null;
                break;
            } catch (org.flywaydb.core.api.FlywayException raced) {
                last = raced;
                Thread.sleep(2000);
            }
        }
        if (last != null) {
            throw last;
        }
        assertThat(last).isNull();
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
