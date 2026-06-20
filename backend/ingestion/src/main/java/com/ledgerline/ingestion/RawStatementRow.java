package com.ledgerline.ingestion;

import java.time.LocalDate;

/**
 * The intermediate representation a {@link StatementParser} produces: one row,
 * still in its raw on-the-statement form (positive amount magnitude in paise,
 * the direction the parser inferred, the verbatim description from the bank).
 *
 * <p>Why a separate type from {@link com.ledgerline.contracts.Transaction}:
 * the domain {@code Transaction} carries tenant + account context, ingestion
 * source, dedup hash, and an {@code ingestedAt} timestamp — none of which the
 * parser can know. Splitting "what the file says" from "what the system
 * records" keeps each layer's responsibility tight: parsers do format work,
 * the normaliser stamps in system metadata. This is the seam that lets the v1
 * Account Aggregator adapter slot in cleanly — AA will emit RawStatementRows
 * the same way; only the parser implementation changes.
 *
 * <p>Money is already integer paise here — the parser does the rupee→paise
 * conversion. Never a {@code double} or {@code BigDecimal} past this point.
 *
 * @param postedAt        date the bank posted this row (DATE in the schema)
 * @param amountMinor     POSITIVE magnitude in paise; sign lives in direction
 * @param direction       debit (leaving) or credit (arriving)
 * @param rawDescription  verbatim statement text — the dedup-hash input
 */
public record RawStatementRow(
    LocalDate postedAt,
    long amountMinor,
    com.ledgerline.contracts.TransactionDirection direction,
    String rawDescription
) {
    public RawStatementRow {
        if (postedAt == null) {
            throw new IllegalArgumentException("postedAt is required");
        }
        if (direction == null) {
            throw new IllegalArgumentException("direction is required");
        }
        if (rawDescription == null) {
            throw new IllegalArgumentException("rawDescription is required");
        }
        // The schema CHECK (amount_minor >= 0) is the source of truth; mirror
        // it here so a malformed row fails at parse-time, not at insert-time.
        if (amountMinor < 0) {
            throw new IllegalArgumentException(
                "amountMinor must be a non-negative magnitude (got " + amountMinor + ")");
        }
    }
}
