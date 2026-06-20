package com.ledgerline.identity;

import java.util.UUID;

/**
 * RBAC failures, mirroring the {@code LedgerException} nested-class
 * convention. Thrown by {@link RbacService#requirePermission}.
 */
public class RbacException extends RuntimeException {

    protected RbacException(String message) {
        super(message);
    }

    /** The user's role in this tenant does not grant the required permission. */
    public static final class Forbidden extends RbacException {
        private final UUID userId;
        private final UUID tenantId;
        private final String permissionKey;

        public Forbidden(UUID userId, UUID tenantId, String permissionKey) {
            super("user " + userId + " lacks '" + permissionKey + "' in tenant " + tenantId);
            this.userId = userId;
            this.tenantId = tenantId;
            this.permissionKey = permissionKey;
        }

        public UUID userId() { return userId; }
        public UUID tenantId() { return tenantId; }
        public String permissionKey() { return permissionKey; }
    }
}
