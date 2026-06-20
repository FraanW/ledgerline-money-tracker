package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code users} table (migration V7) — a GLOBAL identity, not
 * tenant-scoped: one person, possibly a member of many tenants.
 *
 * <p>{@code authSubject} maps to Supabase {@code auth.users.id} (the JWT
 * {@code sub}); nullable until the first sign-in links it. No password is
 * ever stored — credentials are Supabase's job (ADR-0011).
 */
public record User(
    UUID id,
    UUID authSubject,
    String email,
    String displayName,
    String avatarUrl,
    UserStatus status,
    Instant createdAt,
    Instant updatedAt
) {}
