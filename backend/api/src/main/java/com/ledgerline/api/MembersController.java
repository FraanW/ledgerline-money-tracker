package com.ledgerline.api;

import com.ledgerline.identity.IdentityService;
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
 * Household member management (Sweep 4) — the multi-user story becomes real:
 * the owner adds Rohan as a viewer, changes roles, removes members.
 *
 * <pre>
 * GET    /api/v0/members                              (member:read)
 * POST   /api/v0/members {email, displayName?, role}  (member:manage)
 *        provisions the user by email if needed (idempotent upsert), then
 *        upserts the membership at the given role
 * PUT    /api/v0/members/{userId} {role}              (member:manage)
 * DELETE /api/v0/members/{userId}                     (member:manage)
 * </pre>
 *
 * <h2>The last-owner guard</h2>
 * A workspace must always have at least one ACTIVE owner. Demoting or
 * removing the last owner is refused with 400 — otherwise a household could
 * lock itself out permanently (no one left with {@code member:manage}).
 */
@RestController
public class MembersController {

    private final ApiGate gate;
    private final TenantContext tenantContext;
    private final IdentityService identityService;

    public MembersController(ApiGate gate, TenantContext tenantContext, IdentityService identityService) {
        this.gate = gate;
        this.tenantContext = tenantContext;
        this.identityService = identityService;
    }

    public record MemberItem(
        UUID userId, String displayName, String email, String role, String status, String joinedAt) {}

    public record AddMemberRequest(String email, String displayName, String role) {}

    public record ChangeRoleRequest(String role) {}

    @GetMapping(value = "/api/v0/members", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "member:read");
        List<MemberItem> items = tenantContext.withTenantAndUser(
            scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) ->
                jdbc.query(
                    """
                    SELECT m.user_id, u.display_name, u.email, r.key AS role_key,
                           m.status::text AS status, m.joined_at
                    FROM memberships m
                    JOIN users u ON u.id = m.user_id
                    JOIN roles r ON r.id = m.role_id
                    WHERE m.tenant_id = ?
                    ORDER BY m.joined_at
                    """,
                    (rs, i) -> new MemberItem(
                        UUID.fromString(rs.getString("user_id")),
                        rs.getString("display_name"),
                        rs.getString("email"),
                        rs.getString("role_key"),
                        rs.getString("status"),
                        rs.getTimestamp("joined_at").toInstant().toString()),
                    scope.tenantId()));
        return Map.of("items", items);
    }

    @PostMapping(
        value = "/api/v0/members",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> add(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody AddMemberRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "member:manage");
        if (req.email() == null || req.email().isBlank() || !req.email().contains("@")) {
            throw new ApiException.BadRequest("email is required and must look like an email");
        }
        String roleKey = requireRoleKey(req.role());

        // Provision-by-email is idempotent (control-plane); the display name
        // defaults to the email's local part until the person signs in.
        String displayName = (req.displayName() == null || req.displayName().isBlank())
            ? req.email().substring(0, req.email().indexOf('@'))
            : req.displayName().trim();
        UUID memberUserId = identityService.provisionUser(null, req.email().trim(), displayName);

        tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            UUID roleId = resolveRole(jdbc, scope.tenantId(), roleKey);
            jdbc.update(
                """
                INSERT INTO memberships (user_id, tenant_id, role_id, status, invited_by)
                VALUES (?, ?, ?, 'active'::membership_status, ?)
                ON CONFLICT (user_id, tenant_id)
                  DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active'::membership_status
                """,
                memberUserId, scope.tenantId(), roleId, scope.userId());
        });
        return Map.of("userId", memberUserId, "role", roleKey);
    }

    @PutMapping(
        value = "/api/v0/members/{memberUserId}",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> changeRole(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID memberUserId,
        @RequestBody ChangeRoleRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "member:manage");
        String roleKey = requireRoleKey(req.role());

        tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            guardLastOwner(jdbc, scope.tenantId(), memberUserId,
                /* becomesNonOwner = */ !roleKey.equals("owner"),
                "cannot demote the last owner");
            UUID roleId = resolveRole(jdbc, scope.tenantId(), roleKey);
            int updated = jdbc.update(
                "UPDATE memberships SET role_id = ? WHERE user_id = ? AND tenant_id = ?",
                roleId, memberUserId, scope.tenantId());
            if (updated == 0) {
                throw new ApiException.NotFound("no membership for user " + memberUserId);
            }
        });
        return Map.of("userId", memberUserId, "role", roleKey);
    }

    @DeleteMapping(value = "/api/v0/members/{memberUserId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> remove(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @PathVariable UUID memberUserId
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "member:manage");
        tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            guardLastOwner(jdbc, scope.tenantId(), memberUserId,
                /* becomesNonOwner = */ true,
                "cannot remove the last owner");
            int deleted = jdbc.update(
                "DELETE FROM memberships WHERE user_id = ? AND tenant_id = ?",
                memberUserId, scope.tenantId());
            if (deleted == 0) {
                throw new ApiException.NotFound("no membership for user " + memberUserId);
            }
        });
        return Map.of("removed", true);
    }

    // ---------------------------------------------------------------------

    /** System roles + this tenant's custom roles are addressable by key. */
    private static UUID resolveRole(JdbcTemplate jdbc, UUID tenantId, String roleKey) {
        List<UUID> ids = jdbc.query(
            """
            SELECT id FROM roles
            WHERE key = ? AND (tenant_id IS NULL OR tenant_id = ?)
            ORDER BY tenant_id NULLS LAST
            """,
            (rs, i) -> UUID.fromString(rs.getString("id")),
            roleKey, tenantId);
        if (ids.isEmpty()) {
            throw new ApiException.BadRequest("unknown role '" + roleKey + "'");
        }
        return ids.get(0);
    }

    /**
     * Refuse any change that would leave the workspace with zero ACTIVE
     * owners. Only fires when the TARGET currently is an owner and the change
     * would make them not-an-owner (demote or remove).
     */
    private static void guardLastOwner(
        JdbcTemplate jdbc, UUID tenantId, UUID targetUserId, boolean becomesNonOwner, String message) {
        if (!becomesNonOwner) {
            return;
        }
        // LOCK the active-owner membership rows for the rest of this transaction
        // (FOR UPDATE OF m — only the memberships rows, NOT the shared system
        // `roles` row). This serialises concurrent demote/remove requests: a
        // second request targeting a different owner blocks here until the first
        // commits, then re-reads the post-commit owner set (Postgres re-evaluates
        // the WHERE on lock acquisition), so two racers can't both pass and drive
        // the workspace to zero owners (Worf finding #5).
        List<UUID> activeOwners = jdbc.query(
            """
            SELECT m.user_id
            FROM memberships m JOIN roles r ON r.id = m.role_id
            WHERE m.tenant_id = ?
              AND m.status = 'active'::membership_status
              AND r.key = 'owner'
            FOR UPDATE OF m
            """,
            (rs, i) -> UUID.fromString(rs.getString("user_id")),
            tenantId);
        // Only an issue if the TARGET is itself the (sole remaining) active owner.
        if (activeOwners.contains(targetUserId) && activeOwners.size() <= 1) {
            throw new ApiException.BadRequest(message);
        }
    }

    private static String requireRoleKey(String role) {
        if (role == null || role.isBlank()) {
            throw new ApiException.BadRequest("role is required (owner|admin|member|viewer or a custom role key)");
        }
        return role.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
