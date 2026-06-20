package com.ledgerline.identity;

import java.util.UUID;

/**
 * A user's membership in one workspace, flattened for the "pick your
 * workspace" read ({@link IdentityService#listMemberships}).
 */
public record MembershipView(
    UUID tenantId,
    String tenantName,
    String role,
    String status
) {}
