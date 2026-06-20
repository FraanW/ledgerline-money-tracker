package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * The grouping row for a double-entry movement — mirror of the
 * {@code ledger_transfers} table (migration V2).
 *
 * <p>Contract-divergence note: the TS {@code domain.ts} models a transfer
 * IMPLICITLY ("the set of LedgerEntries sharing a transferId") and has no
 * {@code LedgerTransfer} interface. The SQL schema (the validated keeper) made
 * it an EXPLICIT row so the grouping has a clean FK target, a {@code createdAt},
 * and a place to hang a description. The Java contract follows the SQL — this
 * record is the authoritative mirror of the table that actually exists.
 *
 * <p>A transfer is composed of two-or-more {@link LedgerEntry} rows whose signed
 * {@code delta}s sum to zero (the double-entry invariant, enforced by M12).
 */
public record LedgerTransfer(
    UUID id,
    UUID tenantId,
    String description,     // nullable, e.g. "spend: Groceries", "rebudget"
    Instant createdAt
) {}
