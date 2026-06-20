package com.ledgerline.api;

import com.ledgerline.ledger.LedgerException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * One consistent JSON error shape for the :api surface.
 *
 * <ul>
 *   <li>{@link ApiException.BadRequest} → 400</li>
 *   <li>{@link ApiException.NotFound} → 404</li>
 *   <li>{@link LedgerException.InvalidArguments} → 400 (caller's input)</li>
 *   <li>{@link LedgerException.WouldGoNegative} → 422 — the M12 never-negative
 *       floor refused the movement; the request was well-formed but the money
 *       is not there. The app shows this as "not enough in that envelope".</li>
 * </ul>
 * (403 lives in {@code RbacExceptionAdvice}; both advices are global.)
 */
@RestControllerAdvice
public class ApiExceptionAdvice {

    @ExceptionHandler(ApiException.BadRequest.class)
    public ResponseEntity<Map<String, String>> badRequest(ApiException.BadRequest ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(ApiException.NotFound.class)
    public ResponseEntity<Map<String, String>> notFound(ApiException.NotFound ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(LedgerException.InvalidArguments.class)
    public ResponseEntity<Map<String, String>> ledgerBadInput(LedgerException.InvalidArguments ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(LedgerException.WouldGoNegative.class)
    public ResponseEntity<Map<String, String>> wouldGoNegative(LedgerException.WouldGoNegative ex) {
        return ResponseEntity.unprocessableEntity()
            .body(Map.of(
                "error", "would_go_negative",
                "detail", ex.getMessage()));
    }

    /** Malformed / empty / truncated JSON body → 400, not a raw 500 (Worf #2). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> unreadableBody(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "malformed or missing request body"));
    }

    /** Upload over the configured multipart limit → 413, not a raw 500 (Worf #6). */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> tooLarge(MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
            .body(Map.of("error", "file too large"));
    }
}
