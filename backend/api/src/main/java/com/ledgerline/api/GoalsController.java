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
 * Goals / sinking funds (V10) — the goal planner + Make-Room nudges.
 *
 * <pre>
 * GET    /api/v0/goals                                   (goal:read)
 * POST   /api/v0/goals {name, targetMinor, currentMinor?, icon?, envelopeId?}  (goal:write)
 * PUT    /api/v0/goals/{id} (same body)                  (goal:write)
 * DELETE /api/v0/goals/{id}                              (goal:write)
 * </pre>
 */
@RestController
public class GoalsController {

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public GoalsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record GoalItem(
        UUID id, String name, String icon, long targetMinor, long currentMinor, UUID envelopeId) {}

    public record GoalRequest(
        String name, String icon, Long targetMinor, Long currentMinor, UUID envelopeId) {}

    @GetMapping(value = "/api/v0/goals", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "goal:read");
        List<GoalItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT id, name, icon, target_minor, current_minor, envelope_id
                    FROM goals WHERE tenant_id = ? ORDER BY created_at
                    """,
                    (rs, i) -> new GoalItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("name"),
                        rs.getString("icon"),
                        rs.getLong("target_minor"),
                        rs.getLong("current_minor"),
                        rs.getString("envelope_id") == null ? null : UUID.fromString(rs.getString("envelope_id"))),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/goals",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> create(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody GoalRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "goal:write");
        validate(req);
        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO goals (tenant_id, name, icon, target_minor, current_minor, envelope_id)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, ?, ?, ?, ?, ?)
                RETURNING id
                """,
                UUID.class,
                req.name().trim(), req.icon(), req.targetMinor(),
                req.currentMinor() == null ? 0L : req.currentMinor(),
                req.envelopeId()));
        return Map.of("goalId", id);
    }

    @PutMapping(
        value = "/api/v0/goals/{id}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> update(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id,
        @RequestBody GoalRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "goal:write");
        validate(req);
        int updated = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update(
                """
                UPDATE goals
                SET name = ?, icon = ?, target_minor = ?, current_minor = ?,
                    envelope_id = ?, updated_at = now()
                WHERE id = ? AND tenant_id = ?
                """,
                req.name().trim(), req.icon(), req.targetMinor(),
                req.currentMinor() == null ? 0L : req.currentMinor(),
                req.envelopeId(), id, scope.tenantId()));
        if (updated == 0) {
            throw new ApiException.NotFound("goal " + id + " not found");
        }
        return Map.of("goalId", id);
    }

    @DeleteMapping(value = "/api/v0/goals/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> delete(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "goal:write");
        int deleted = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update("DELETE FROM goals WHERE id = ? AND tenant_id = ?", id, scope.tenantId()));
        if (deleted == 0) {
            throw new ApiException.NotFound("goal " + id + " not found");
        }
        return Map.of("deleted", true);
    }

    private static void validate(GoalRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ApiException.BadRequest("name is required");
        }
        if (req.targetMinor() == null || req.targetMinor() <= 0) {
            throw new ApiException.BadRequest("targetMinor must be > 0 (paise)");
        }
        if (req.currentMinor() != null && req.currentMinor() < 0) {
            throw new ApiException.BadRequest("currentMinor must be >= 0 (paise)");
        }
    }
}
