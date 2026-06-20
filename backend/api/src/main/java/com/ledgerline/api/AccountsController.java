package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Linked accounts — read for Settings/Transactions, create so the upload flow
 * has an account to ingest against (manual linking until the AA integration).
 *
 * <pre>
 * GET  /api/v0/accounts                                  (account:read)
 * POST /api/v0/accounts {institution, accountType, maskedNumber}  (account:write)
 * </pre>
 */
@RestController
public class AccountsController {

    private static final Set<String> ACCOUNT_TYPES = Set.of("savings", "current", "credit_card", "other");

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public AccountsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record AccountItem(UUID id, String institution, String accountType, String maskedNumber, String currency, String createdAt) {}

    public record CreateAccountRequest(String institution, String accountType, String maskedNumber) {}

    @GetMapping(value = "/api/v0/accounts", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "account:read");
        List<AccountItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT id, institution, account_type::text AS account_type, masked_number,
                           currency::text AS currency, created_at
                    FROM accounts WHERE tenant_id = ? ORDER BY created_at
                    """,
                    (rs, i) -> new AccountItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("institution"),
                        rs.getString("account_type"),
                        rs.getString("masked_number"),
                        rs.getString("currency"),
                        rs.getTimestamp("created_at").toInstant().toString()),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/accounts",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> create(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody CreateAccountRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "account:write");
        if (req.institution() == null || req.institution().isBlank()) {
            throw new ApiException.BadRequest("institution is required");
        }
        if (req.accountType() == null || !ACCOUNT_TYPES.contains(req.accountType())) {
            throw new ApiException.BadRequest("accountType must be one of " + ACCOUNT_TYPES);
        }
        if (req.maskedNumber() == null || req.maskedNumber().isBlank()) {
            throw new ApiException.BadRequest("maskedNumber is required");
        }

        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO accounts (tenant_id, institution, account_type, masked_number)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?, ?::account_type, ?)
                RETURNING id
                """,
                UUID.class,
                req.institution().trim(),
                req.accountType(),
                req.maskedNumber().trim()));
        return Map.of("accountId", id);
    }
}
