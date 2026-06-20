package com.ledgerline.contracts;

import java.util.UUID;

/**
 * Mirror of the TS {@code Category} and the {@code categories} table (migration V2).
 */
public record Category(
    UUID id,
    UUID tenantId,
    String name,
    CategoryKind kind
) {}
