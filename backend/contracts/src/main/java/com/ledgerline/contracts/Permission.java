package com.ledgerline.contracts;

import java.util.UUID;

/**
 * Mirror of the {@code permissions} table (migration V7) — the global
 * {@code resource:action} catalogue (31 seeded). {@code key} is
 * {@code resource + ":" + action}, e.g. {@code "statement:write"}.
 */
public record Permission(
    UUID id,
    String key,
    String resource,
    String action,
    String description
) {}
