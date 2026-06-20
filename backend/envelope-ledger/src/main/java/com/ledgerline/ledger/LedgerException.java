package com.ledgerline.ledger;

/**
 * Base exception for M12 ledger invariant violations.
 *
 * <p>Every {@code LedgerException} is a {@link RuntimeException}, so a throw inside
 * the {@code TenantContext.withTenant(...)} transaction triggers a ROLLBACK —
 * nothing is written. This is the "all-or-nothing" half of atomic transfers.
 */
public class LedgerException extends RuntimeException {

    public LedgerException(String message) {
        super(message);
    }

    /**
     * Thrown when a transfer's entries do not sum to exactly zero. This is the
     * sum-to-zero invariant guard — checked server-side BEFORE any insert.
     */
    public static class NotBalanced extends LedgerException {
        public NotBalanced(long sum) {
            super("Transfer entries do not sum to zero (sum = " + sum + " minor units)");
        }
    }

    /**
     * Thrown when posting a transfer would drive a {@code user} envelope's balance
     * below zero. Checked AFTER acquiring the {@code SELECT ... FOR UPDATE} lock
     * on the affected envelope row, against the freshly-summed entry balance.
     */
    public static class WouldGoNegative extends LedgerException {
        public WouldGoNegative(java.util.UUID envelopeId, long currentMinor, long deltaMinor) {
            super("Envelope " + envelopeId + " would go negative: "
                + currentMinor + " + (" + deltaMinor + ") = " + (currentMinor + deltaMinor));
        }
    }

    /** Thrown when input arguments are structurally invalid (e.g. zero or negative amount). */
    public static class InvalidArguments extends LedgerException {
        public InvalidArguments(String message) {
            super(message);
        }
    }
}
