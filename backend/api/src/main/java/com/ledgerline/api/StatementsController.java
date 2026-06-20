package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Ingestion history (V12) — what the Log / Transactions surfaces show as
 * "your uploads".
 *
 * <pre>
 * GET /api/v0/statements → { items: [Statement…] }   (permission: statement:read)
 * </pre>
 */
@RestController
public class StatementsController {

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public StatementsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record StatementItem(
        UUID id,
        UUID accountId,
        String fileName,
        String source,
        int acceptedCount,
        int duplicateCount,
        int errorCount,
        String status,
        String uploadedAt
    ) {}

    @GetMapping(value = "/api/v0/statements", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "statement:read");
        List<StatementItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT id, account_id, file_name, source::text AS source, accepted_count,
                           duplicate_count, error_count, status::text AS status, uploaded_at
                    FROM statements WHERE tenant_id = ? ORDER BY uploaded_at DESC LIMIT 100
                    """,
                    (rs, i) -> new StatementItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("account_id") == null ? null : UUID.fromString(rs.getString("account_id")),
                        rs.getString("file_name"),
                        rs.getString("source"),
                        rs.getInt("accepted_count"),
                        rs.getInt("duplicate_count"),
                        rs.getInt("error_count"),
                        rs.getString("status"),
                        rs.getTimestamp("uploaded_at").toInstant().toString()),
                    scope.tenantId()));
        return Map.of("items", items);
    }
}
