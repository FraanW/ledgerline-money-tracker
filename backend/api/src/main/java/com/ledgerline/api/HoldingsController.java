package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * Investment holdings (V10) — the /investments surface.
 *
 * <pre>
 * GET    /api/v0/holdings                       (holding:read)
 * POST   /api/v0/holdings {name, kind, investedMinor, valueMinor, expenseRatioBps?, regularPlan?}
 * PUT    /api/v0/holdings/{id}  (same body)     (holding:write)
 * DELETE /api/v0/holdings/{id}                  (holding:write)
 * </pre>
 */
@RestController
public class HoldingsController {

    private static final Set<String> KINDS = Set.of("index", "equity", "debt", "gold", "ulip");

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public HoldingsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record HoldingItem(
        UUID id, String name, String kind, long investedMinor, long valueMinor,
        Integer expenseRatioBps, boolean regularPlan) {}

    public record HoldingRequest(
        String name, String kind, Long investedMinor, Long valueMinor,
        Integer expenseRatioBps, Boolean regularPlan) {}

    @GetMapping(value = "/api/v0/holdings", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "holding:read");
        List<HoldingItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT id, name, kind::text AS kind, invested_minor, value_minor,
                           expense_ratio_bps, regular_plan
                    FROM holdings WHERE tenant_id = ? ORDER BY name
                    """,
                    (rs, i) -> new HoldingItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("name"),
                        rs.getString("kind"),
                        rs.getLong("invested_minor"),
                        rs.getLong("value_minor"),
                        (Integer) rs.getObject("expense_ratio_bps"),
                        rs.getBoolean("regular_plan")),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/holdings",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> create(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody HoldingRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "holding:write");
        validate(req);
        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO holdings (tenant_id, name, kind, invested_minor, value_minor,
                                      expense_ratio_bps, regular_plan)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?, ?::holding_kind, ?, ?, ?, ?)
                RETURNING id
                """,
                UUID.class,
                req.name().trim(), req.kind(), req.investedMinor(), req.valueMinor(),
                req.expenseRatioBps(), req.regularPlan() != null && req.regularPlan()));
        return Map.of("holdingId", id);
    }

    @PutMapping(
        value = "/api/v0/holdings/{id}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> update(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id,
        @RequestBody HoldingRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "holding:write");
        validate(req);
        int updated = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update(
                """
                UPDATE holdings
                SET name = ?, kind = ?::holding_kind, invested_minor = ?, value_minor = ?,
                    expense_ratio_bps = ?, regular_plan = ?, updated_at = now()
                WHERE id = ? AND tenant_id = ?
                """,
                req.name().trim(), req.kind(), req.investedMinor(), req.valueMinor(),
                req.expenseRatioBps(), req.regularPlan() != null && req.regularPlan(), id, scope.tenantId()));
        if (updated == 0) {
            throw new ApiException.NotFound("holding " + id + " not found");
        }
        return Map.of("holdingId", id);
    }

    @DeleteMapping(value = "/api/v0/holdings/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> delete(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "holding:write");
        int deleted = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update("DELETE FROM holdings WHERE id = ? AND tenant_id = ?", id, scope.tenantId()));
        if (deleted == 0) {
            throw new ApiException.NotFound("holding " + id + " not found");
        }
        return Map.of("deleted", true);
    }

    private static void validate(HoldingRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ApiException.BadRequest("name is required");
        }
        if (req.kind() == null || !KINDS.contains(req.kind())) {
            throw new ApiException.BadRequest("kind must be one of " + KINDS);
        }
        if (req.investedMinor() == null || req.investedMinor() < 0
            || req.valueMinor() == null || req.valueMinor() < 0) {
            throw new ApiException.BadRequest("investedMinor and valueMinor must be >= 0 (paise)");
        }
        if (req.expenseRatioBps() != null && (req.expenseRatioBps() < 0 || req.expenseRatioBps() > 10000)) {
            throw new ApiException.BadRequest("expenseRatioBps must be 0..10000");
        }
    }
}
