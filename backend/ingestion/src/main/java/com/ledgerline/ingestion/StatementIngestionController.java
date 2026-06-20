package com.ledgerline.ingestion;

import com.ledgerline.identity.ActingUserResolver;
import com.ledgerline.identity.RbacService;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The v0 HTTP front door for M1 ingestion.
 *
 * <p>Single endpoint: {@code POST /api/v0/ingest/statement} (multipart form
 * upload). The user uploads a CSV file alongside {@code accountId} (the
 * account this statement belongs to). The tenant comes from a request
 * header ({@code X-Tenant-Id}) — v0 explicitly does NOT do auth; that is a
 * later milestone. The header-driven tenancy plugs into the same
 * {@link com.ledgerline.platform.db.TenantContext#withTenant withTenant}
 * primitive every other DB-touching module uses, so when real auth lands it
 * is a single change to where the tenant id is sourced.
 *
 * <h2>Identity + RBAC (Sweep 1)</h2>
 * An OPTIONAL {@code X-User-Id} header carries the acting user. When present,
 * the request is gated by the data-driven RBAC matrix (V7):
 * {@code statement:write} must be granted to the user's role in this tenant,
 * else <b>403</b> (via {@link com.ledgerline.identity.RbacExceptionAdvice}).
 * The ingest transaction then also carries the {@code app.current_user_id}
 * GUC. When absent, the legacy v0 header-only path still works — Supabase JWT
 * validation will replace BOTH headers in one place later.
 *
 * <h2>Request</h2>
 * <pre>
 * POST /api/v0/ingest/statement
 * X-Tenant-Id: 11111111-1111-1111-1111-111111111111
 * X-User-Id:   33333333-3333-3333-3333-333333333333   (optional, gates RBAC)
 * Content-Type: multipart/form-data; boundary=...
 *
 *   accountId=22222222-2222-2222-2222-222222222222
 *   file=@statement.csv (text/csv)
 * </pre>
 *
 * <h2>Response (200 — happy path)</h2>
 * <pre>
 * {
 *   "statementId": "...",   // persisted: the statements row (V12)
 *   "totalRows": 12,
 *   "accepted": 10,
 *   "duplicates": 2,
 *   "errors": []
 * }
 * </pre>
 *
 * <h2>Error responses</h2>
 * <ul>
 *   <li><b>400</b> — missing {@code X-Tenant-Id}, missing {@code file},
 *       malformed {@code accountId} / {@code X-User-Id}, or the file is
 *       structurally unparseable (e.g. CSV header missing required column).</li>
 *   <li><b>403</b> — {@code X-User-Id} present but the user's role does not
 *       grant {@code statement:write} in this tenant.</li>
 *   <li><b>200 + non-empty errors[]</b> — file was valid, but specific rows
 *       failed parsing. The user can fix those rows and re-upload; dedup
 *       absorbs the already-ingested rows on the retry.</li>
 * </ul>
 */
@RestController
public class StatementIngestionController {

    private static final Logger log = LoggerFactory.getLogger(StatementIngestionController.class);

    private final IngestionService ingestionService;
    private final RbacService rbac;
    private final ActingUserResolver actingUser;

    public StatementIngestionController(
        IngestionService ingestionService, RbacService rbac, ActingUserResolver actingUser) {
        this.ingestionService = ingestionService;
        this.rbac = rbac;
        this.actingUser = actingUser;
    }

    @PostMapping(
        value = "/api/v0/ingest/statement",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> ingestStatement(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @RequestParam("accountId") String accountIdParam,
        @RequestParam("file") MultipartFile file,
        // Password-protected PDF statements (Indian banks): unlocked on the
        // fly; the password is used in memory only — never logged, never stored.
        @RequestParam(value = "password", required = false) String password
    ) throws IOException {

        UUID tenantId;
        UUID accountId;
        try {
            if (tenantHeader == null || tenantHeader.isBlank()) {
                return badRequest("missing X-Tenant-Id header");
            }
            tenantId = UUID.fromString(tenantHeader.trim());
        } catch (IllegalArgumentException badUuid) {
            return badRequest("X-Tenant-Id is not a valid UUID");
        }
        // Sweep 4: bearer token (verified) beats the dev header; identity is
        // OPTIONAL here only for the legacy header-free v0 path.
        UUID userId = actingUser.resolve(authorization, userHeader, false).orElse(null);
        try {
            accountId = UUID.fromString(accountIdParam.trim());
        } catch (IllegalArgumentException badUuid) {
            return badRequest("accountId is not a valid UUID");
        }
        if (file == null || file.isEmpty()) {
            return badRequest("file is required and must be non-empty");
        }

        // RBAC gate — only when an acting user is identified. Forbidden
        // propagates to RbacExceptionAdvice → 403.
        if (userId != null) {
            rbac.requirePermission(userId, tenantId, "statement:write");
        }

        String fileName = (file.getOriginalFilename() == null || file.getOriginalFilename().isBlank())
            ? "statement.csv"
            : file.getOriginalFilename();

        try {
            IngestionResult result = ingestionService.ingest(
                tenantId, userId, accountId, fileName, file.getInputStream(), password);
            log.info(
                "ingest tenant={} user={} account={} statement={} total={} accepted={} duplicates={} errors={}",
                tenantId, userId, accountId, result.statementId(),
                result.totalRows(), result.accepted(), result.duplicates(),
                result.errors().size());
            return ResponseEntity.ok(result);
        } catch (StatementParseException structurallyBroken) {
            // A whole-file failure (no header, missing required column).
            return badRequest("statement is not parseable: " + structurallyBroken.getMessage());
        }
    }

    private static ResponseEntity<java.util.Map<String, String>> badRequest(String message) {
        return ResponseEntity.badRequest().body(java.util.Map.of("error", message));
    }
}
