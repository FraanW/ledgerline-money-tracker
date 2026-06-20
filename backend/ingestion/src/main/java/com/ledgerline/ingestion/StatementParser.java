package com.ledgerline.ingestion;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

/**
 * The parser strategy seam — one implementation per statement format
 * (CSV today; PDF later; the v1 Account Aggregator adapter slots in HERE
 * by emitting {@link RawStatementRow}s the same way).
 *
 * <p>Per ADR-0003 the source is swappable: M1 is an adapter, and everything
 * downstream (normaliser, dedup, M11 categoriser, M12 ledger) consumes the
 * same {@code Transaction} stream. The whole point of this interface is to
 * make that swap a single concrete-class drop — not a rewrite.
 *
 * <h2>Contract</h2>
 * <ul>
 *   <li>{@link #parse(InputStream)} returns rows in file order; the caller
 *       does dedup, normalisation, and insertion.</li>
 *   <li>One malformed row MUST NOT poison the rest of the file — the parser
 *       returns a list of {@link ParsedRow} which is either a {@code RawStatementRow}
 *       or a per-row error message. The orchestrating service surfaces those
 *       errors in the HTTP response's {@code errors[]} array.</li>
 *   <li>A parser that cannot even read the file's structure (truncated CSV,
 *       missing required header) throws {@link StatementParseException} — that
 *       is a whole-file failure, not a per-row failure.</li>
 * </ul>
 *
 * <h2>Why "format" instead of "bank"</h2>
 * One bank can have multiple CSV exports (web vs mobile); two banks can share
 * the same column layout. The strategy keys off the FORMAT (columns) rather
 * than the bank — the bank is just text we record as {@code institution} on
 * the account, not a strategy selector.
 */
public interface StatementParser {

    /** Stable identifier for this parser strategy, e.g. {@code "csv.generic-v1"}. */
    String formatId();

    /**
     * Parse a statement into raw rows + per-row errors. Implementations close
     * the stream when they are done with it.
     *
     * @throws StatementParseException if the file is not even structurally
     *         parseable (e.g. required header missing) — this is a whole-file
     *         failure surfaced as a 400 by the controller.
     */
    List<ParsedRow> parse(InputStream input) throws IOException, StatementParseException;

    /**
     * One entry in the parser's output stream. EITHER {@code row} is non-null
     * (a successfully-parsed row) OR {@code error} is non-null (a per-row
     * failure message). The 1-based {@code lineNumber} is from the source
     * file; it surfaces in HTTP errors so the user can find the offending
     * row in their statement.
     */
    record ParsedRow(int lineNumber, RawStatementRow row, String error) {
        public static ParsedRow ok(int lineNumber, RawStatementRow row) {
            return new ParsedRow(lineNumber, row, null);
        }
        public static ParsedRow error(int lineNumber, String error) {
            return new ParsedRow(lineNumber, null, error);
        }
        public boolean isOk() {
            return row != null;
        }
    }
}
