package com.ledgerline.identity;

import com.ledgerline.platform.db.TenantContext;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The data-driven RBAC gate (migration V7): does {@code user} hold
 * {@code permission} in {@code tenant}?
 *
 * <p>The check runs INSIDE {@link TenantContext#withTenant} — deliberately.
 * Under the tenant GUC the FORCE-RLS {@code memberships} row is visible, the
 * system-role {@code role_permissions} rows pass their
 * {@code tenant_id IS NULL} policy clause, and {@code permissions} is a
 * readable catalogue — so the gate works under the non-superuser app role
 * with no control-plane privileges.
 *
 * <p>Permission keys are the seeded {@code resource:action} catalogue
 * ({@code "statement:write"}, {@code "member:manage"}, ...). Unknown keys are
 * simply never granted — fail closed.
 */
@Service
public class RbacService {

    private final TenantContext tenantContext;

    public RbacService(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    /** True iff the user has an ACTIVE membership whose role grants the permission. */
    public boolean hasPermission(UUID userId, UUID tenantId, String permissionKey) {
        Boolean granted = tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                """
                SELECT EXISTS (
                  SELECT 1
                  FROM memberships m
                  JOIN role_permissions rp ON rp.role_id = m.role_id
                  JOIN permissions p       ON p.id = rp.permission_id
                  WHERE m.user_id = ?
                    AND m.tenant_id = ?
                    AND m.status = 'active'::membership_status
                    AND p.key = ?
                )
                """,
                Boolean.class,
                userId,
                tenantId,
                permissionKey));
        return Boolean.TRUE.equals(granted);
    }

    /**
     * Gate a request path: no-op when granted, {@link RbacException.Forbidden}
     * when not (mapped to HTTP 403 by {@link RbacExceptionAdvice}).
     */
    public void requirePermission(UUID userId, UUID tenantId, String permissionKey) {
        if (!hasPermission(userId, tenantId, permissionKey)) {
            throw new RbacException.Forbidden(userId, tenantId, permissionKey);
        }
    }
}
