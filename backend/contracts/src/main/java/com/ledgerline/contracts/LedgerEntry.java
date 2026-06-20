package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the TS {@code LedgerEntry} and the {@code ledger_entries} table
 * (migration V2).
 *
 * <p>Double-entry: every movement is a {@code transferId} group of entries whose
 * signed {@code delta}s sum to zero. {@code delta} is SIGNED (credit positive,
 * debit negative) — stored as {@code delta_minor BIGINT}. {@code transactionId}
 * references the originating bank transaction for a spend entry; it is null for a
 * pure re-budget. The two M12 invariants (per-transfer sum = 0; never-negative
 * envelope balance) are enforced by the M12 service, not the schema.
 */
public record LedgerEntry(
    UUID id,
    UUID tenantId,
    UUID transferId,
    UUID envelopeId,
    Money delta,
    UUID transactionId,     // nullable for a pure re-budget
    Instant createdAt
) {}
