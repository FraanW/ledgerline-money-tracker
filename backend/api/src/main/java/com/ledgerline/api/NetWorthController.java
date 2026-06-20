package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Net-worth items (V10) — the /networth (Rich-Dad balance sheet) surface.
 *
 * <pre>
 * GET    /api/v0/networth                      (networth:read)
 *        → { items, totals: {assetsMinor, liabilitiesMinor, netMinor} }
 * POST   /api/v0/networth {itemType, name, amountMinor, incomeGenerating?, note?}
 * PUT    /api/v0/networth/{id} (same body)     (networth:write)
 * DELETE /api/v0/networth/{id}                 (networth:write)
 * </pre>
 */
@RestController
public class NetWorthController {

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public NetWorthController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record NetWorthItem(
        UUID id, String itemType, String name, long amountMinor,
        Boolean incomeGenerating, String note) {}

    public record NetWorthRequest(
        String itemType, String name, Long amountMinor, Boolean incomeGenerating, String note) {}

    @GetMapping(value = "/api/v0/networth", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "networth:read");
        return tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            List<NetWorthItem> items = jdbc.query(
                """
                SELECT id, item_type::text AS item_type, name, amount_minor, income_generating, note
                FROM balance_sheet_items WHERE tenant_id = ? ORDER BY item_type, amount_minor DESC
                """,
                (rs, i) -> new NetWorthItem(
                    UUID.fromString(rs.getString("id")),
                    rs.getString("item_type"),
                    rs.getString("name"),
                    rs.getLong("amount_minor"),
                    (Boolean) rs.getObject("income_generating"),
                    rs.getString("note")),
                scope.tenantId());

            long assets = items.stream()
                .filter(x -> "asset".equals(x.itemType())).mapToLong(NetWorthItem::amountMinor).sum();
            long liabilities = items.stream()
                .filter(x -> "liability".equals(x.itemType())).mapToLong(NetWorthItem::amountMinor).sum();

            return Map.of(
                "items", items,
                "totals", Map.of(
                    "assetsMinor", assets,
                    "liabilitiesMinor", liabilities,
                    "netMinor", assets - liabilities));
        });
    }

    @PostMapping(
        value = "/api/v0/networth",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> create(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody NetWorthRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "networth:write");
        validate(req);
        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO balance_sheet_items (tenant_id, item_type, name, amount_minor, income_generating, note)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?::balance_item_type, ?, ?, ?, ?)
                RETURNING id
                """,
                UUID.class,
                req.itemType(), req.name().trim(), req.amountMinor(),
                "asset".equals(req.itemType()) ? req.incomeGenerating() : null,
                req.note()));
        return Map.of("itemId", id);
    }

    @PutMapping(
        value = "/api/v0/networth/{id}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> update(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id,
        @RequestBody NetWorthRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "networth:write");
        validate(req);
        int updated = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update(
                """
                UPDATE balance_sheet_items
                SET item_type = ?::balance_item_type, name = ?, amount_minor = ?,
                    income_generating = ?, note = ?, updated_at = now()
                WHERE id = ? AND tenant_id = ?
                """,
                req.itemType(), req.name().trim(), req.amountMinor(),
                "asset".equals(req.itemType()) ? req.incomeGenerating() : null,
                req.note(), id, scope.tenantId()));
        if (updated == 0) {
            throw new ApiException.NotFound("net-worth item " + id + " not found");
        }
        return Map.of("itemId", id);
    }

    @DeleteMapping(value = "/api/v0/networth/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> delete(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "networth:write");
        int deleted = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update("DELETE FROM balance_sheet_items WHERE id = ? AND tenant_id = ?", id, scope.tenantId()));
        if (deleted == 0) {
            throw new ApiException.NotFound("net-worth item " + id + " not found");
        }
        return Map.of("deleted", true);
    }

    private static void validate(NetWorthRequest req) {
        if (req.itemType() == null || !(req.itemType().equals("asset") || req.itemType().equals("liability"))) {
            throw new ApiException.BadRequest("itemType must be 'asset' or 'liability'");
        }
        if (req.name() == null || req.name().isBlank()) {
            throw new ApiException.BadRequest("name is required");
        }
        if (req.amountMinor() == null || req.amountMinor() < 0) {
            throw new ApiException.BadRequest("amountMinor must be >= 0 (paise)");
        }
    }
}
