package com.ledgerline.identity;

/**
 * Identity-resolution failures (Sweep 4 finale), mirroring the nested-class
 * convention. Mapped to HTTP by {@link RbacExceptionAdvice}.
 */
public class AuthException extends RuntimeException {

    protected AuthException(String message) {
        super(message);
    }

    /** Bearer token missing where required, invalid, expired, or unverifiable → 401. */
    public static final class Unauthorized extends AuthException {
        public Unauthorized(String message) {
            super(message);
        }
    }

    /** Malformed/missing dev identity header → 400 (preserves the v0 contract). */
    public static final class BadIdentityHeader extends AuthException {
        public BadIdentityHeader(String message) {
            super(message);
        }
    }
}
