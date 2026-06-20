package com.ledgerline.ingestion;

/**
 * Thrown when a statement file is so structurally broken that the parser cannot
 * even establish a row stream — e.g. a CSV with no header row, or a required
 * header column missing. This is a WHOLE-FILE failure (HTTP 400 at the
 * controller). Per-row failures use {@link StatementParser.ParsedRow#error}
 * instead and do not throw, so one bad line never poisons the rest of the file.
 */
public class StatementParseException extends RuntimeException {

    public StatementParseException(String message) {
        super(message);
    }

    public StatementParseException(String message, Throwable cause) {
        super(message, cause);
    }
}
