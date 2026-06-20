package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ledgerline.identity.RbacExceptionAdvice;
import com.ledgerline.identity.RbacService;
import com.ledgerline.platform.db.TenantContext;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * HTTP smoke test for the M1 ingestion controller — verifies the wire shape
 * (status codes + JSON keys) without standing up the DB. The
 * {@link IngestionService} is a hand-rolled subclass that returns a fixed
 * {@link IngestionResult}; this keeps the test focused on the HTTP boundary
 * (multipart parsing, header reading, JSON shape, error mapping, the RBAC
 * gate). The RBAC service is likewise a recording fake.
 *
 * <p>The full DB-aware end-to-end behaviour lives in
 * {@link IngestionServiceTest} — that suite is the source of truth for the
 * actual ingestion semantics.
 */
class StatementIngestionControllerTest {

    private FakeIngestionService fake;
    private FakeRbacService rbac;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        fake = new FakeIngestionService();
        rbac = new FakeRbacService();
        // Blank Supabase url → bearer refused; dev headers on; the identity
        // service is never reached on the header path.
        StatementIngestionController controller = new StatementIngestionController(
            fake, rbac, new com.ledgerline.identity.ActingUserResolver("", true, null));
        mvc = MockMvcBuilders.standaloneSetup(controller)
            .setControllerAdvice(new RbacExceptionAdvice())
            .build();
    }

    @Test
    @DisplayName("happy path: 200 with JSON shape { statementId, totalRows, accepted, duplicates, errors }")
    void happy_path_returns_expected_json_shape() throws Exception {
        UUID tenantId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID accountId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        UUID statementId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        fake.nextResult = new IngestionResult(statementId, 3, 2, 1, List.of(
            new IngestionResult.RowError(5, "bad row")
        ));

        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv",
            "Date,Description,Debit,Credit\n2026-05-01,X,100.00,\n".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", accountId.toString())
                .header("X-Tenant-Id", tenantId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.statementId").value(statementId.toString()))
            .andExpect(jsonPath("$.totalRows").value(3))
            .andExpect(jsonPath("$.accepted").value(2))
            .andExpect(jsonPath("$.duplicates").value(1))
            .andExpect(jsonPath("$.errors[0].lineNumber").value(5))
            .andExpect(jsonPath("$.errors[0].message").value("bad row"));

        // Service was called with the parsed UUIDs from header + param; no
        // user header → no RBAC check, null user passed through.
        assertThat(fake.tenantSeen).isEqualTo(tenantId);
        assertThat(fake.accountSeen).isEqualTo(accountId);
        assertThat(fake.userSeen).isNull();
        assertThat(rbac.permissionChecked).isNull();
    }

    @Test
    @DisplayName("X-User-Id present + permission granted: 200, RBAC saw statement:write, user flows into the service")
    void user_header_grants_and_flows_through() throws Exception {
        UUID tenantId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        UUID userId = UUID.fromString("44444444-4444-4444-4444-444444444444");

        MockMultipartFile file = new MockMultipartFile(
            "file", "june.csv", "text/csv",
            "Date,Description,Debit,Credit\n2026-06-01,X,100.00,\n".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .header("X-Tenant-Id", tenantId.toString())
                .header("X-User-Id", userId.toString()))
            .andExpect(status().isOk());

        assertThat(rbac.permissionChecked).isEqualTo("statement:write");
        assertThat(rbac.userChecked).isEqualTo(userId);
        assertThat(rbac.tenantChecked).isEqualTo(tenantId);
        assertThat(fake.userSeen).isEqualTo(userId);
        assertThat(fake.fileNameSeen).isEqualTo("june.csv");
        assertThat(fake.passwordSeen).as("no password field sent").isNull();
    }

    @Test
    @DisplayName("PDF password field flows through to the service (and is never echoed back)")
    void pdf_password_flows_through() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.pdf", "application/pdf", "%PDF-1.7 fake".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .param("password", "ANAY0107")
                .header("X-Tenant-Id", "11111111-1111-1111-1111-111111111111"))
            .andExpect(status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                .content().string(org.hamcrest.Matchers.not(
                    org.hamcrest.Matchers.containsString("ANAY0107"))));

        assertThat(fake.passwordSeen).isEqualTo("ANAY0107");
    }

    @Test
    @DisplayName("X-User-Id present + permission denied: 403 with { error: forbidden, permission }")
    void user_without_permission_is_403() throws Exception {
        rbac.deny = true;

        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv", "x".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .header("X-Tenant-Id", "11111111-1111-1111-1111-111111111111")
                .header("X-User-Id", "44444444-4444-4444-4444-444444444444"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("forbidden"))
            .andExpect(jsonPath("$.permission").value("statement:write"));

        // Denied before the service is ever touched.
        assertThat(fake.tenantSeen).isNull();
    }

    @Test
    @DisplayName("malformed X-User-Id -> 400")
    void malformed_user_uuid_is_400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv", "x".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .header("X-Tenant-Id", "11111111-1111-1111-1111-111111111111")
                .header("X-User-Id", "not-a-uuid"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("X-User-Id is not a valid UUID"));
    }

    @Test
    @DisplayName("missing X-Tenant-Id -> 400 with a clear error message")
    void missing_tenant_header_is_400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv", "x".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("missing X-Tenant-Id header"));
    }

    @Test
    @DisplayName("structurally broken file (parser throws) -> 400 with the parser message")
    void structurally_broken_file_is_400() throws Exception {
        fake.throwParseException = true;
        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv",
            "no-header-row".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .header("X-Tenant-Id", "11111111-1111-1111-1111-111111111111"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(
                org.hamcrest.Matchers.containsString("not parseable")));
    }

    @Test
    @DisplayName("malformed tenant UUID -> 400")
    void malformed_tenant_uuid_is_400() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
            "file", "statement.csv", "text/csv", "x".getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/v0/ingest/statement")
                .file(file)
                .param("accountId", "22222222-2222-2222-2222-222222222222")
                .header("X-Tenant-Id", "not-a-uuid"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("X-Tenant-Id is not a valid UUID"));
    }

    /**
     * Hand-rolled stub — easier to reason about than a Mockito mock for
     * recording-and-returning. The test asserts on the captured args.
     *
     * <p>Subclasses the production IngestionService with a null TenantContext —
     * that is safe here because the only entry point invoked is the
     * identity-aware {@code ingest(...)} overload and we override it entirely.
     */
    private static final class FakeIngestionService extends IngestionService {

        IngestionResult nextResult = new IngestionResult(UUID.randomUUID(), 0, 0, 0, List.of());
        boolean throwParseException = false;
        UUID tenantSeen;
        UUID userSeen;
        UUID accountSeen;
        String fileNameSeen;
        String passwordSeen;

        FakeIngestionService() {
            super(
                Mockito.mock(TenantContext.class),
                Mockito.mock(StatementParser.class),
                txn -> {}
            );
        }

        @Override
        public IngestionResult ingest(
            UUID tenantId, UUID userId, UUID accountId, String fileName,
            InputStream csv, String pdfPassword)
            throws IOException, StatementParseException {
            this.tenantSeen = tenantId;
            this.userSeen = userId;
            this.accountSeen = accountId;
            this.fileNameSeen = fileName;
            this.passwordSeen = pdfPassword;
            // Drain the stream so the multipart parser is exercised cleanly.
            csv.readAllBytes();
            if (throwParseException) {
                throw new StatementParseException("missing required header 'Credit'");
            }
            return nextResult;
        }
    }

    /** Recording RBAC fake — grants unless {@code deny} is flipped. */
    private static final class FakeRbacService extends RbacService {

        boolean deny = false;
        UUID userChecked;
        UUID tenantChecked;
        String permissionChecked;

        FakeRbacService() {
            super(Mockito.mock(TenantContext.class));
        }

        @Override
        public boolean hasPermission(UUID userId, UUID tenantId, String permissionKey) {
            this.userChecked = userId;
            this.tenantChecked = tenantId;
            this.permissionChecked = permissionKey;
            return !deny;
        }
    }
}
