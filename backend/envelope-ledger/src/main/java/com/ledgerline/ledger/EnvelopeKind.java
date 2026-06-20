package com.ledgerline.ledger;

/**
 * Structural type of an envelope row — mirror of the Postgres {@code envelope_kind}
 * enum added in migration V4.
 *
 * <p>The M12 ledger needs PSEUDO-ACCOUNT counterparts so that every movement is a
 * balanced double-entry transfer:
 * <ul>
 *   <li>{@link #user}        — a real, period-scoped budget envelope (Groceries 2026-05).
 *       The {@code never-negative} invariant applies to {@code user} envelopes ONLY.</li>
 *   <li>{@link #income}      — pseudo-account; source-side counterpart of incoming
 *       income. Accumulates negative balance as money flows out into Unallocated.</li>
 *   <li>{@link #unallocated} — pseudo-account; money received but not yet budgeted
 *       into a user envelope.</li>
 *   <li>{@link #spent}       — pseudo-account; sink-side counterpart of outgoing
 *       spends. Accumulates positive balance as user envelopes are debited.</li>
 * </ul>
 *
 * <p>Pseudo-account envelopes are NOT period-scoped — one row per (tenant, kind).
 * V4 enforces this with a partial UNIQUE index. Their {@code period} column holds
 * the sentinel {@code "system"} purely so the existing NOT NULL constraint is
 * satisfied; the discriminator that the code keys off is {@code kind}, never the
 * period sentinel.
 */
public enum EnvelopeKind {
    user,
    income,
    unallocated,
    spent
}
