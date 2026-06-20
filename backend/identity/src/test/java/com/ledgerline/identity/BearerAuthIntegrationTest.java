package com.ledgerline.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ledgerline.platform.db.TenantContext;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Sweep 4 → the FULL bearer landing path, end to end through HTTP into the REAL
 * dual-mode DB. The unit test {@link SupabaseJwtVerifierTest} proves the
 * verifier in isolation; THIS proves the whole seam:
 * <pre>
 *   Authorization: Bearer &lt;ES256 jwt&gt;
 *     → ActingUserResolver (verifier built from supabaseUrl + JWKS path)
 *     → IdentityService.findOrProvisionByAuthSubject (auto-provision by email)
 *     → IdentityController.me → {userId, email, memberships}
 * </pre>
 *
 * <p>We ARE Supabase here: the test holds a self-signed ES256 private key and
 * serves only the public JWKS from an in-JVM HttpServer (the exact harness
 * pattern from {@link SupabaseJwtVerifierTest}). The resolver is constructed
 * with {@code realAuth=true}, which flips two security postures we assert:
 * <ul>
 *   <li>auto-provisioning REQUIRES {@code user_metadata.email_verified=true};</li>
 *   <li>the {@code X-User-Id} dev header is REFUSED (401) — no impersonation
 *       oracle once a verifier is configured (Tasha findings #2/#3/#5).</li>
 * </ul>
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BearerAuthIntegrationTest {

    private static final String DOCKER_IMAGE = "pgvector/pgvector:pg16";
    private static final String OWNER_USER = "ledgerline";
    private static final String OWNER_PASSWORD = "ledgerline";
    private static final String APP_USER = "ledgerline_app";
    private static final String APP_PASSWORD = "ledgerline_app";

    private static final ObjectMapper JSON = new ObjectMapper();

    private PostgreSQLContainer<?> container;
    private HttpServer jwksServer;
    private ECKey signingKey;     // the "Supabase" keypair
    private ECKey strangerKey;    // an attacker's keypair, never published

    private JdbcTemplate ownerJdbc;
    private MockMvc mvc;

    @BeforeAll
    void setUp() throws Exception {
        // --- "Supabase": a self-signed ES256 key, public JWKS over HTTP -----
        signingKey = new ECKeyGenerator(Curve.P_256).keyID("bearer-test-kid").generate();
        strangerKey = new ECKeyGenerator(Curve.P_256).keyID("evil-kid").generate();

        String jwksJson = new JWKSet(List.of(signingKey.toPublicJWK())).toString();
        jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        // The resolver builds the JWKS url as supabaseUrl + "/auth/v1/.well-known/jwks.json",
        // so we serve it at exactly that path.
        jwksServer.createContext("/auth/v1/.well-known/jwks.json", exchange -> {
            byte[] bytes = jwksJson.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        jwksServer.start();
        String supabaseUrl = "http://127.0.0.1:" + jwksServer.getAddress().getPort();

        // --- the REAL dual-mode DB (external alt-port OR Testcontainers) ----
        final String jdbcUrl;
        if (externalJdbcUrl() != null) {
            jdbcUrl = externalJdbcUrl();
        } else {
            container = new PostgreSQLContainer<>(DockerImageName.parse(DOCKER_IMAGE))
                .withDatabaseName("ledgerline").withUsername(OWNER_USER).withPassword(OWNER_PASSWORD);
            container.start();
            jdbcUrl = container.getJdbcUrl();
        }

        DataSource ownerDs = dataSource(jdbcUrl, OWNER_USER, OWNER_PASSWORD);
        migrateWithRetry(ownerDs);
        this.ownerJdbc = new JdbcTemplate(ownerDs);

        DataSource appDs = dataSource(jdbcUrl, APP_USER, APP_PASSWORD);
        TenantContext appCtx = new TenantContext(new DataSourceTransactionManager(appDs), appDs);
        IdentityService identity = new IdentityService(
            new DataSourceTransactionManager(ownerDs), ownerDs, appCtx);

        // realAuth=true: verifier built from supabaseUrl → bearer is THE path,
        // X-User-Id is refused. dev-headers flag is irrelevant once verifier!=null.
        ActingUserResolver resolver = new ActingUserResolver(supabaseUrl, true, identity);

        this.mvc = MockMvcBuilders
            .standaloneSetup(new IdentityController(identity, resolver))
            .setControllerAdvice(new RbacExceptionAdvice())
            .build();
    }

    @AfterAll
    void tearDown() {
        if (jwksServer != null) {
            jwksServer.stop(0);
        }
        if (ownerJdbc != null) {
            ownerJdbc.update("DELETE FROM users WHERE email LIKE '%@bearer.test'");
        }
        if (container != null) {
            container.stop();
        }
    }

    // =====================================================================

    @Test
    @DisplayName("a verified bearer token auto-provisions the user and /me returns the right userId + email")
    void verified_bearer_autoprovisions_and_me_returns_identity() throws Exception {
        String sub = UUID.randomUUID().toString();
        String token = sign(signingKey, verifiedClaims(sub, "kenji@bearer.test", "Kenji").build());

        MvcResult res = mvc.perform(get("/api/v0/identity/me")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("kenji@bearer.test"))
            .andExpect(jsonPath("$.displayName").value("Kenji"))
            .andReturn();

        // The auto-provisioned user really landed in the DB, linked to the auth subject.
        JsonNode body = JSON.readTree(res.getResponse().getContentAsString());
        UUID userId = UUID.fromString(body.get("userId").asText());
        UUID linkedSubject = ownerJdbc.queryForObject(
            "SELECT auth_subject FROM users WHERE id = ?", UUID.class, userId);
        org.assertj.core.api.Assertions.assertThat(linkedSubject)
            .as("the bearer sub is linked onto the provisioned users row")
            .isEqualTo(UUID.fromString(sub));

        // Idempotent: a second call with the SAME subject returns the SAME user
        // via the auth_subject fast path (no email/verification re-check needed).
        String token2 = sign(signingKey, verifiedClaims(sub, "kenji@bearer.test", "Kenji").build());
        mvc.perform(get("/api/v0/identity/me").header("Authorization", "Bearer " + token2))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value(userId.toString()));
    }

    @Test
    @DisplayName("an EXPIRED token → 401, never a provisioned user")
    void expired_token_is_401() throws Exception {
        String token = sign(signingKey, new JWTClaimsSet.Builder()
            .subject(UUID.randomUUID().toString())
            .audience("authenticated")
            .claim("email", "expired@bearer.test")
            .claim("user_metadata", Map.of("email_verified", true))
            .expirationTime(new Date(System.currentTimeMillis() - 600_000)) // 10 min ago
            .build());

        mvc.perform(get("/api/v0/identity/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a TAMPERED token (signed by a key not in the JWKS) → 401")
    void tampered_token_is_401() throws Exception {
        // Valid-looking claims, but signed by the attacker's unpublished key.
        String token = sign(strangerKey,
            verifiedClaims(UUID.randomUUID().toString(), "evil@bearer.test", "Evil").build());

        mvc.perform(get("/api/v0/identity/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an UNVERIFIED email cannot bind a new users row → 401 (Tasha #5 regression)")
    void unverified_email_is_refused() throws Exception {
        String token = sign(signingKey, new JWTClaimsSet.Builder()
            .subject(UUID.randomUUID().toString())
            .audience("authenticated")
            .issueTime(new Date())
            .expirationTime(new Date(System.currentTimeMillis() + 3_600_000))
            .claim("email", "unverified@bearer.test")
            .claim("user_metadata", Map.of("email_verified", false))
            .build());

        mvc.perform(get("/api/v0/identity/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isUnauthorized());

        Integer rows = ownerJdbc.queryForObject(
            "SELECT count(*) FROM users WHERE email = ?", Integer.class, "unverified@bearer.test");
        org.assertj.core.api.Assertions.assertThat(rows)
            .as("no users row is created for an unverified email").isZero();
    }

    @Test
    @DisplayName("X-User-Id is REFUSED (401) once a verifier is configured — no impersonation oracle (Tasha #2/#3)")
    void dev_header_refused_under_real_auth() throws Exception {
        // /me requires a bearer; supplying ONLY X-User-Id must not auto-trust it.
        mvc.perform(get("/api/v0/identity/me")
                .header("X-User-Id", UUID.randomUUID().toString()))
            .andExpect(status().isUnauthorized());

        // And even on a path that READS X-User-Id (memberships), the resolver
        // rejects the header outright when realAuth is on. listMemberships
        // calls requireBearer first under real auth, so a header-only request 401s.
        mvc.perform(get("/api/v0/identity/users/" + UUID.randomUUID() + "/memberships")
                .header("X-User-Id", UUID.randomUUID().toString()))
            .andExpect(status().isUnauthorized());
    }

    // =====================================================================
    // helpers
    // =====================================================================

    /** Supabase-shaped, fully-verified claims: future exp, authenticated aud, verified email. */
    private static JWTClaimsSet.Builder verifiedClaims(String sub, String email, String name) {
        return new JWTClaimsSet.Builder()
            .subject(sub)
            .audience("authenticated")
            .issueTime(new Date())
            .expirationTime(new Date(System.currentTimeMillis() + 3_600_000))
            .claim("email", email)
            .claim("user_metadata", Map.of("name", name, "email_verified", true));
    }

    private static String sign(ECKey key, JWTClaimsSet claims) throws Exception {
        SignedJWT jwt = new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.ES256)
                .keyID(key.getKeyID())
                .type(JOSEObjectType.JWT)
                .build(),
            claims);
        jwt.sign(new ECDSASigner(key));
        return jwt.serialize();
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
