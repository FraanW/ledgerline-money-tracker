package com.ledgerline.identity;

import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * THE identity seam (Sweep 4 finale): every request's acting user is resolved
 * here, and nowhere else.
 *
 * <p>Resolution order:
 * <ol>
 *   <li><b>{@code Authorization: Bearer <jwt>}</b> — verified against the
 *       Supabase JWKS, then the {@code sub} is mapped to our {@code users}
 *       row (auto-provisioned on first sight, linking {@code auth_subject}).
 *       This is REAL auth.</li>
 *   <li><b>{@code X-User-Id}</b> — the v0 dev header, honoured only while
 *       {@code ledgerline.auth.dev-headers-enabled=true} (the default until
 *       the frontend cutover completes). Flip it to false and the header is
 *       refused with 401 — one property ends the dev era.</li>
 * </ol>
 *
 * <p>When {@code ledgerline.supabase.url} is blank the verifier is absent and
 * bearer tokens are refused with 401 (never silently trusted).
 */
@Component
public class ActingUserResolver {

    private static final Logger log = LoggerFactory.getLogger(ActingUserResolver.class);

    private final SupabaseJwtVerifier verifier; // null when Supabase not configured
    private final IdentityService identityService;
    private final boolean devHeadersEnabled;

    public ActingUserResolver(
        @Value("${ledgerline.supabase.url:}") String supabaseUrl,
        @Value("${ledgerline.auth.dev-headers-enabled:true}") boolean devHeadersEnabled,
        IdentityService identityService
    ) {
        this.identityService = identityService;
        this.devHeadersEnabled = devHeadersEnabled;
        if (supabaseUrl == null || supabaseUrl.isBlank()) {
            this.verifier = null;
            log.info("supabase auth: DISABLED (ledgerline.supabase.url not set) — dev headers only");
        } else {
            String jwks = supabaseUrl.trim().replaceAll("/+$", "") + "/auth/v1/.well-known/jwks.json";
            this.verifier = new SupabaseJwtVerifier(jwks);
            this.verifier.warmUp(); // eager JWKS fetch — first request after boot stays fast
            log.info("supabase auth: ENABLED via {} (dev headers {})",
                jwks, devHeadersEnabled ? "still accepted" : "refused");
        }
    }

    /**
     * Resolve the acting user for a request. {@code required=true} → a missing
     * identity is an error; {@code required=false} → empty (the ingestion
     * controller's legacy ungated path).
     */
    public Optional<UUID> resolve(String authorizationHeader, String xUserIdHeader, boolean required) {
        // 1. Real auth: a Bearer token wins over everything.
        if (authorizationHeader != null && authorizationHeader.trim().regionMatches(true, 0, "Bearer ", 0, 7)) {
            if (verifier == null) {
                throw new AuthException.Unauthorized("bearer auth is not configured on this server");
            }
            String token = authorizationHeader.trim().substring(7).trim();
            SupabaseJwtVerifier.VerifiedToken verified = verifier.verify(token);
            UUID subject;
            try {
                subject = UUID.fromString(verified.subject());
            } catch (IllegalArgumentException badSub) {
                throw new AuthException.Unauthorized("invalid or expired access token");
            }
            return Optional.of(identityService.findOrProvisionByAuthSubject(
                subject, verified.email(), verified.displayName(), verified.emailVerified()));
        }

        // 2. Dev header — v0 compatibility. SECURITY: refused the moment real
        // auth is configured (verifier != null). Otherwise X-User-Id would be a
        // trivial impersonation oracle (send any victim UUID, no token). It is
        // honoured ONLY in keyless local/dev/test mode, and only while the flag
        // is on. (Tasha findings #2/#3.)
        if (xUserIdHeader != null && !xUserIdHeader.isBlank()) {
            if (verifier != null) {
                throw new AuthException.Unauthorized(
                    "X-User-Id is not accepted when bearer auth is configured — send a bearer token");
            }
            if (!devHeadersEnabled) {
                throw new AuthException.Unauthorized("X-User-Id is disabled — send a bearer token");
            }
            try {
                return Optional.of(UUID.fromString(xUserIdHeader.trim()));
            } catch (IllegalArgumentException badUuid) {
                throw new AuthException.BadIdentityHeader("X-User-Id is not a valid UUID");
            }
        }

        if (required) {
            throw (verifier != null)
                ? new AuthException.Unauthorized("missing bearer token")
                : new AuthException.BadIdentityHeader("missing X-User-Id header");
        }
        return Optional.empty();
    }

    /** True when Supabase JWT verification is configured (production posture). */
    public boolean realAuthEnabled() {
        return verifier != null;
    }

    /** Bearer-only resolution (the /identity/me path) — 401 when absent. */
    public UUID requireBearer(String authorizationHeader) {
        if (authorizationHeader == null
            || !authorizationHeader.trim().regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new AuthException.Unauthorized("missing bearer token");
        }
        return resolve(authorizationHeader, null, true).orElseThrow();
    }
}
