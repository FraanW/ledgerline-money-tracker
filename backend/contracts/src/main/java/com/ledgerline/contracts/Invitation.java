package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code invitations} table (migration V7) — a pending invite
 * for {@code email} to join {@code tenantId} at {@code roleId}. Accepting by
 * token is a control-plane operation (the invitee is not yet a member, so the
 * tenant-scoped path cannot see the row).
 */
public record Invitation(
    UUID id,
    UUID tenantId,
    String email,
    UUID roleId,
    String token,
    InvitationStatus status,
    UUID invitedBy,
    Instant expiresAt,
    Instant acceptedAt,
    Instant createdAt
) {}
