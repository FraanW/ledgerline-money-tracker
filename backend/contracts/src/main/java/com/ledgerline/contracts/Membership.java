package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code memberships} table (migration V7) — the heart of RBAC:
 * the (user × tenant × role) assignment. PK is {@code (userId, tenantId)}.
 */
public record Membership(
    UUID userId,
    UUID tenantId,
    UUID roleId,
    MembershipStatus status,
    UUID invitedBy,
    Instant joinedAt
) {}
