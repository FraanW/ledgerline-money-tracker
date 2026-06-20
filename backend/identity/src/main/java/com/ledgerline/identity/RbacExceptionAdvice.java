package com.ledgerline.identity;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps identity-layer failures to HTTP for EVERY controller in the app, so
 * denials have one consistent JSON shape: {@link RbacException.Forbidden} →
 * 403, {@link AuthException.Unauthorized} → 401,
 * {@link AuthException.BadIdentityHeader} → 400 (the v0 header contract).
 */
@RestControllerAdvice
public class RbacExceptionAdvice {

    @ExceptionHandler(RbacException.Forbidden.class)
    public ResponseEntity<Map<String, String>> forbidden(RbacException.Forbidden ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(Map.of(
                "error", "forbidden",
                "permission", ex.permissionKey()));
    }

    @ExceptionHandler(AuthException.Unauthorized.class)
    public ResponseEntity<Map<String, String>> unauthorized(AuthException.Unauthorized ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(AuthException.BadIdentityHeader.class)
    public ResponseEntity<Map<String, String>> badIdentityHeader(AuthException.BadIdentityHeader ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
