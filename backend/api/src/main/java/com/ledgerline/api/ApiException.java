package com.ledgerline.api;

/**
 * API-boundary failures, mirroring the {@code LedgerException} nested-class
 * convention. Mapped to HTTP statuses by {@link ApiExceptionAdvice}.
 */
public class ApiException extends RuntimeException {

    protected ApiException(String message) {
        super(message);
    }

    /** Malformed/missing input → 400. */
    public static final class BadRequest extends ApiException {
        public BadRequest(String message) {
            super(message);
        }
    }

    /** The addressed resource does not exist in this tenant → 404. */
    public static final class NotFound extends ApiException {
        public NotFound(String message) {
            super(message);
        }
    }
}
