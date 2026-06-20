package com.ledgerline.api;

import com.ledgerline.identity.ActingUserResolver;
import com.ledgerline.identity.RbacService;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * The one place a request becomes a (tenant, user) scope.
 *
 * <p>Sweep 4 finale: the acting USER now comes from
 * {@link ActingUserResolver} — a verified Supabase bearer token when present
 * (real auth), else the v0 {@code X-User-Id} dev header while the
 * {@code ledgerline.auth.dev-headers-enabled} flag stays on. The TENANT stays
 * a client-chosen {@code X-Tenant-Id} (the workspace selector) — safe, because
 * the RBAC permission check IS the membership validation: a tenant you don't
 * belong to yields 403 regardless of what you put in the header.
 */
@Component
public class ApiGate {

    private final RbacService rbac;
    private final ActingUserResolver actingUser;

    public ApiGate(RbacService rbac, ActingUserResolver actingUser) {
        this.rbac = rbac;
        this.actingUser = actingUser;
    }

    /** A validated request scope: who is acting, in which workspace. */
    public record Scope(UUID tenantId, UUID userId) {}

    /**
     * Resolve the acting user (bearer-first), parse the tenant header, and
     * require {@code permission} — 401 invalid token, 400 missing/malformed
     * headers, 403 when the user's role does not grant the permission.
     */
    public Scope require(String tenantHeader, String userHeader, String permission) {
        UUID tenantId = parse(tenantHeader, "X-Tenant-Id");
        UUID userId = actingUser.resolve(currentAuthorizationHeader(), userHeader, true).orElseThrow();
        rbac.requirePermission(userId, tenantId, permission);
        return new Scope(tenantId, userId);
    }

    /** Resolve just the acting user — for self-scoped paths (user settings). */
    public UUID requireUser(String userHeader) {
        return actingUser.resolve(currentAuthorizationHeader(), userHeader, true).orElseThrow();
    }

    /**
     * The Authorization header of the in-flight request. Read via the request
     * context so the ~40 existing controller signatures stay untouched.
     */
    private static String currentAuthorizationHeader() {
        if (RequestContextHolder.getRequestAttributes()
            instanceof ServletRequestAttributes servlet) {
            return servlet.getRequest().getHeader("Authorization");
        }
        return null;
    }

    private static UUID parse(String value, String headerName) {
        if (value == null || value.isBlank()) {
            throw new ApiException.BadRequest("missing " + headerName + " header");
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException badUuid) {
            throw new ApiException.BadRequest(headerName + " is not a valid UUID");
        }
    }
}
