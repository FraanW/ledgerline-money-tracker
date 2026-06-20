package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
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
 * Categories + categorization rules — the data behind the Tag Workshop and
 * every category dropdown in the app.
 *
 * <pre>
 * GET    /api/v0/categories                       (category:read)
 * POST   /api/v0/categories {name, kind}          (category:write)
 * GET    /api/v0/rules                            (rule:read)
 * POST   /api/v0/rules {patternKind, pattern, categoryId, priority?}   (rule:write)
 * PUT    /api/v0/rules/{id} {patternKind, pattern, categoryId, priority, enabled}  (rule:write)
 * DELETE /api/v0/rules/{id}                       (rule:write)
 * </pre>
 */
@RestController
public class TaxonomyController {

    private static final Set<String> CATEGORY_KINDS = Set.of("income", "expense", "transfer");
    private static final Set<String> PATTERN_KINDS = Set.of("contains", "equals", "regex");

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public TaxonomyController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record CategoryItem(UUID id, String name, String kind) {}

    public record CreateCategoryRequest(String name, String kind) {}

    public record RuleItem(UUID id, String patternKind, String pattern, UUID categoryId, int priority, boolean enabled) {}

    public record RuleRequest(String patternKind, String pattern, UUID categoryId, Integer priority, Boolean enabled) {}

    // ---------- categories ----------

    @GetMapping(value = "/api/v0/categories", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> categories(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "category:read");
        List<CategoryItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    "SELECT id, name, kind::text AS kind FROM categories WHERE tenant_id = ? ORDER BY name",
                    (rs, i) -> new CategoryItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("name"),
                        rs.getString("kind")),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/categories",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> createCategory(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody CreateCategoryRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "category:write");
        if (req.name() == null || req.name().isBlank()) {
            throw new ApiException.BadRequest("name is required");
        }
        if (req.kind() == null || !CATEGORY_KINDS.contains(req.kind())) {
            throw new ApiException.BadRequest("kind must be one of " + CATEGORY_KINDS);
        }
        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO categories (tenant_id, name, kind)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, ?, ?::category_kind)
                RETURNING id
                """,
                UUID.class, req.name().trim(), req.kind()));
        return Map.of("categoryId", id);
    }

    // ---------- rules ----------

    @GetMapping(value = "/api/v0/rules", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> rules(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "rule:read");
        List<RuleItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT id, pattern_kind::text AS pattern_kind, pattern, category_id, priority, enabled
                    FROM categorization_rules WHERE tenant_id = ? ORDER BY priority, id
                    """,
                    (rs, i) -> new RuleItem(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("pattern_kind"),
                        rs.getString("pattern"),
                        UUID.fromString(rs.getString("category_id")),
                        rs.getInt("priority"),
                        rs.getBoolean("enabled")),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/rules",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> createRule(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody RuleRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "rule:write");
        validateRule(req);
        UUID id = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                INSERT INTO categorization_rules (tenant_id, pattern_kind, pattern, category_id, priority, enabled)
                VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid,
                        ?::rule_pattern_kind, ?, ?, ?, ?)
                RETURNING id
                """,
                UUID.class,
                req.patternKind(), req.pattern().trim(), req.categoryId(),
                req.priority() == null ? 100 : req.priority(),
                req.enabled() == null || req.enabled()));
        return Map.of("ruleId", id);
    }

    @PutMapping(
        value = "/api/v0/rules/{id}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> updateRule(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id,
        @RequestBody RuleRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "rule:write");
        validateRule(req);
        int updated = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update(
                """
                UPDATE categorization_rules
                SET pattern_kind = ?::rule_pattern_kind, pattern = ?, category_id = ?, priority = ?, enabled = ?
                WHERE id = ? AND tenant_id = ?
                """,
                req.patternKind(), req.pattern().trim(), req.categoryId(),
                req.priority() == null ? 100 : req.priority(),
                req.enabled() == null || req.enabled(),
                id, scope.tenantId()));
        if (updated == 0) {
            throw new ApiException.NotFound("rule " + id + " not found");
        }
        return Map.of("ruleId", id);
    }

    @DeleteMapping(value = "/api/v0/rules/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> deleteRule(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID id
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "rule:write");
        int deleted = tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
            jdbc.update("DELETE FROM categorization_rules WHERE id = ? AND tenant_id = ?", id, scope.tenantId()));
        if (deleted == 0) {
            throw new ApiException.NotFound("rule " + id + " not found");
        }
        return Map.of("deleted", true);
    }

    /** Pattern length cap — keeps a single rule from being a DoS lever (and is plenty for real merchant patterns). */
    private static final int MAX_PATTERN_LEN = 200;

    private static void validateRule(RuleRequest req) {
        if (req.patternKind() == null || !PATTERN_KINDS.contains(req.patternKind())) {
            throw new ApiException.BadRequest("patternKind must be one of " + PATTERN_KINDS);
        }
        if (req.pattern() == null || req.pattern().isBlank()) {
            throw new ApiException.BadRequest("pattern is required");
        }
        if (req.pattern().length() > MAX_PATTERN_LEN) {
            throw new ApiException.BadRequest("pattern must be at most " + MAX_PATTERN_LEN + " characters");
        }
        if (req.categoryId() == null) {
            throw new ApiException.BadRequest("categoryId is required");
        }
        // Reject an un-compilable regex at WRITE time (400) rather than letting
        // it persist and detonate later in the categoriser (Worf finding #7).
        if ("regex".equals(req.patternKind())) {
            try {
                Pattern.compile(req.pattern());
            } catch (PatternSyntaxException bad) {
                throw new ApiException.BadRequest("invalid regex: " + bad.getDescription());
            }
        }
    }
}
