package com.ledgerline.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.identity.IdentityService;
import com.ledgerline.identity.RbacExceptionAdvice;
import com.ledgerline.identity.RbacService;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Sweep 4 — member management through HTTP with real RLS/RBAC (dual-mode
 * harness, SUT under the non-superuser app role). Covers: add-by-email with
 * auto-provision, role listing, viewer-cannot-manage, role change, the
 * last-owner guard (demote AND remove), and clean 404/400 contracts.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MembersIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private PostgreSQLContainer<?> container;
    private JdbcTemplate ownerJdbc;
    private MockMvc mvc;
    private IdentityService identityService;

    private UUID owner;
    private UUID tenant;
    private UUID rohan; // added through the API in test 1

    @BeforeAll
    void setUp() throws InterruptedException {
        final String jdbcUrl;
        if (externalJdbcUrl() != null) {
            jdbcUrl = externalJdbcUrl();
        } else {
            container = new PostgreSQLContainer<>(DockerImageName.parse("pgvector/pgvector:pg16"))
                .withDatabaseName("ledgerline").withUsername("ledgerline").withPassword("ledgerline");
            container.start();
            jdbcUrl = container.getJdbcUrl();
        }

        DataSource ownerDs = dataSource(jdbcUrl, "ledgerline", "ledgerline");
        migrateWithRetry(ownerDs);
        this.ownerJdbc = new JdbcTemplate(ownerDs);

        DataSource appDs = dataSource(jdbcUrl, "ledgerline_app", "ledgerline_app");
        TenantContext appCtx = new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        IdentityService identity = new IdentityService(
            new DataSourceTransactionManager(ownerDs), ownerDs, appCtx);
        this.identityService = identity;
        ApiGate gate = new ApiGate(new RbacService(appCtx),
            new com.ledgerline.identity.ActingUserResolver("", true, identity));

        this.mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders
            .standaloneSetup(new MembersController(gate, appCtx, identity))
            .setControllerAdvice(new ApiExceptionAdvice(), new RbacExceptionAdvice())
            .build();

        owner = identity.provisionUser(null, "members-owner@mem.test", "Owner");
        tenant = identity.createWorkspace(owner, "Members Household");
    }

    @AfterAll
    void tearDown() {
        if (ownerJdbc != null) {
            ownerJdbc.update(
                "DELETE FROM tenants WHERE display_name IN ('Members Household', 'Race Household')");
            ownerJdbc.update("DELETE FROM users WHERE email LIKE '%@mem.test'");
        }
        if (container != null) {
            container.stop();
        }
    }

    @Test
    @Order(1)
    @DisplayName("owner adds a viewer by email (auto-provisioned); list shows both with roles")
    void add_member_by_email() throws Exception {
        MvcResult added = mvc.perform(post("/api/v0/members")
                .headers(headers(owner))
                .contentType("application/json")
                .content("{\"email\":\"rohan@mem.test\",\"displayName\":\"Rohan\",\"role\":\"viewer\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("viewer"))
            .andReturn();
        rohan = UUID.fromString(
            JSON.readTree(added.getResponse().getContentAsString()).get("userId").asText());

        mvc.perform(get("/api/v0/members").headers(headers(owner)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(2))
            .andExpect(jsonPath("$.items[0].role").value("owner"))
            .andExpect(jsonPath("$.items[1].email").value("rohan@mem.test"))
            .andExpect(jsonPath("$.items[1].role").value("viewer"));
    }

    @Test
    @Order(2)
    @DisplayName("the viewer can LIST members but cannot MANAGE them (403)")
    void viewer_reads_but_cannot_manage() throws Exception {
        mvc.perform(get("/api/v0/members").headers(headers(rohan)))
            .andExpect(status().isOk());
        mvc.perform(post("/api/v0/members")
                .headers(headers(rohan))
                .contentType("application/json")
                .content("{\"email\":\"sneaky@mem.test\",\"role\":\"admin\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.permission").value("member:manage"));
    }

    @Test
    @Order(3)
    @DisplayName("role change works; unknown role -> 400")
    void role_change() throws Exception {
        mvc.perform(put("/api/v0/members/" + rohan)
                .headers(headers(owner))
                .contentType("application/json")
                .content("{\"role\":\"member\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("member"));

        mvc.perform(put("/api/v0/members/" + rohan)
                .headers(headers(owner))
                .contentType("application/json")
                .content("{\"role\":\"galactic-emperor\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @Order(4)
    @DisplayName("the last owner can neither be demoted nor removed (400)")
    void last_owner_is_protected() throws Exception {
        mvc.perform(put("/api/v0/members/" + owner)
                .headers(headers(owner))
                .contentType("application/json")
                .content("{\"role\":\"viewer\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("cannot demote the last owner"));

        mvc.perform(delete("/api/v0/members/" + owner).headers(headers(owner)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("cannot remove the last owner"));
    }

    @Test
    @Order(5)
    @DisplayName("remove member -> gone; removing again -> 404")
    void remove_member() throws Exception {
        mvc.perform(delete("/api/v0/members/" + rohan).headers(headers(owner)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.removed").value(true));
        mvc.perform(delete("/api/v0/members/" + rohan).headers(headers(owner)))
            .andExpect(status().isNotFound());
    }

    @Test
    @Order(6)
    @DisplayName("a malformed / empty JSON body -> 400, never a raw 500 (Worf #2)")
    void malformed_body_is_400() throws Exception {
        // Truncated JSON: Jackson throws HttpMessageNotReadableException, which
        // ApiExceptionAdvice now maps to a clean 400 instead of a 500.
        mvc.perform(post("/api/v0/members")
                .headers(headers(owner))
                .contentType("application/json")
                .content("{\"email\":"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("malformed or missing request body"));

        // An EMPTY body to a @RequestBody endpoint — same handler, same 400.
        mvc.perform(post("/api/v0/members")
                .headers(headers(owner))
                .contentType("application/json")
                .content(""))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("malformed or missing request body"));
    }

    @Test
    @Order(7)
    @DisplayName("two threads demote two DIFFERENT owners at once: exactly one wins, never zero owners (FOR UPDATE OF m)")
    void concurrent_demote_of_two_owners_keeps_one() throws Exception {
        // A fresh workspace with EXACTLY TWO active owners, so each thread
        // targets a different owner. Without the row lock, both would read
        // "2 owners, demoting one is fine" and both could commit -> 0 owners.
        UUID ownerA = identityService.provisionUser(null, "race-a@mem.test", "Race A");
        UUID ownerB = identityService.provisionUser(null, "race-b@mem.test", "Race B");
        UUID raceTenant = identityService.createWorkspace(ownerA, "Race Household");
        UUID ownerRoleId = ownerJdbc.queryForObject(
            "SELECT id FROM roles WHERE tenant_id IS NULL AND key = 'owner'", UUID.class);
        // ownerA is already an owner from createWorkspace; add ownerB as a second owner.
        ownerJdbc.update(
            "INSERT INTO memberships (user_id, tenant_id, role_id, status) VALUES (?, ?, ?, 'active')",
            ownerB, raceTenant, ownerRoleId);

        // Drive the demotes concurrently: A demotes A, B demotes B. Each request
        // acts as ITS OWN target (a member:manage owner demoting themselves).
        java.util.concurrent.CountDownLatch ready = new java.util.concurrent.CountDownLatch(2);
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Future<Integer> fa = pool.submit(
                () -> demoteToViewer(ready, go, raceTenant, ownerA));
            java.util.concurrent.Future<Integer> fb = pool.submit(
                () -> demoteToViewer(ready, go, raceTenant, ownerB));
            ready.await(); // both threads parked at the gate
            go.countDown(); // release them together
            int statusA = fa.get();
            int statusB = fb.get();

            // Exactly one HTTP 200 (won) and one HTTP 400 ("cannot demote the
            // last owner") — never two 200s.
            int wins = (statusA == 200 ? 1 : 0) + (statusB == 200 ? 1 : 0);
            int refusals = (statusA == 400 ? 1 : 0) + (statusB == 400 ? 1 : 0);
            org.assertj.core.api.Assertions.assertThat(wins)
                .as("exactly one demotion succeeds (statusA=%d statusB=%d)", statusA, statusB)
                .isEqualTo(1);
            org.assertj.core.api.Assertions.assertThat(refusals)
                .as("the other is refused with 400 last-owner").isEqualTo(1);
        } finally {
            pool.shutdownNow();
        }

        // The invariant that actually matters: the workspace STILL has an owner.
        Integer activeOwners = ownerJdbc.queryForObject(
            """
            SELECT count(*) FROM memberships m JOIN roles r ON r.id = m.role_id
            WHERE m.tenant_id = ? AND m.status = 'active' AND r.key = 'owner'
            """,
            Integer.class, raceTenant);
        org.assertj.core.api.Assertions.assertThat(activeOwners)
            .as("the workspace never reaches zero active owners").isEqualTo(1);
    }

    /**
     * Park at the shared gate, fire one self-demotion PUT through MockMvc, return
     * the HTTP status. Runs on its own thread → its own non-pooled connection →
     * real DB-level lock contention on the {@code FOR UPDATE OF m} rows.
     */
    private int demoteToViewer(
        java.util.concurrent.CountDownLatch ready,
        java.util.concurrent.CountDownLatch go,
        UUID raceTenant,
        UUID target) throws Exception {
        org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.set("X-Tenant-Id", raceTenant.toString());
        h.set("X-User-Id", target.toString()); // each owner demotes themselves
        ready.countDown();
        go.await();
        return mvc.perform(put("/api/v0/members/" + target)
                .headers(h)
                .contentType("application/json")
                .content("{\"role\":\"viewer\"}"))
            .andReturn().getResponse().getStatus();
    }

    // ---------------------------------------------------------------------

    private org.springframework.http.HttpHeaders headers(UUID user) {
        org.springframework.http.HttpHeaders h = new org.springframework.http.HttpHeaders();
        h.set("X-Tenant-Id", tenant.toString());
        h.set("X-User-Id", user.toString());
        return h;
    }

    private static void migrateWithRetry(DataSource ownerDs) throws InterruptedException {
        org.flywaydb.core.api.FlywayException last = null;
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                Flyway.configure().dataSource(ownerDs)
                    .locations("classpath:db/migration").baselineOnMigrate(true)
                    .load().migrate();
                return;
            } catch (org.flywaydb.core.api.FlywayException raced) {
                last = raced;
                Thread.sleep(2000);
            }
        }
        throw last;
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
