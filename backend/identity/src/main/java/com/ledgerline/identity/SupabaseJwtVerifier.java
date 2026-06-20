package com.ledgerline.identity;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKMatcher;
import com.nimbusds.jose.jwk.JWKSelector;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.ConfigurableJWTProcessor;
import com.nimbusds.jwt.proc.DefaultJWTClaimsVerifier;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import java.net.URL;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Verifies Supabase access tokens against the project's PUBLIC JWKS
 * ({@code {SUPABASE_URL}/auth/v1/.well-known/jwks.json}) — Sweep 4 finale.
 *
 * <p>Supabase signs with asymmetric keys (ES256 on this project; RS256
 * accepted for older projects), so verification needs NO shared secret: the
 * JWKS is fetched once and cached by nimbus's remote JWK source (with
 * rate-limited refresh — a key rotation is picked up automatically).
 *
 * <p>Checks enforced: signature against a published key, {@code exp} /
 * {@code nbf} (with default clock skew), and audience {@code authenticated}
 * (Supabase stamps every signed-in user token with it).
 *
 * <p>What this deliberately does NOT do: authorization. The verified
 * {@code sub} is mapped to a {@code users} row and THEN the normal RBAC gate
 * decides what that user may touch — same pipeline as before, different
 * source of identity.
 */
public class SupabaseJwtVerifier {

    private static final Logger log = LoggerFactory.getLogger(SupabaseJwtVerifier.class);

    /**
     * The verified identity claims we care about. {@code emailVerified} is
     * Supabase's {@code user_metadata.email_verified} (null when the claim is
     * absent) — used to gate the provisioning/link path so an unverified email
     * can't bind to a user row (Tasha finding #5).
     */
    public record VerifiedToken(String subject, String email, String displayName, Boolean emailVerified) {}

    private final ConfigurableJWTProcessor<SecurityContext> processor;
    private final JWKSource<SecurityContext> keySource;

    public SupabaseJwtVerifier(String jwksUrl) {
        try {
            // retrying(true): a transiently-failed JWKS fetch (cold boot, brief
            // DNS hiccup) is retried instead of surfacing as a spurious 401.
            // The default cache + rate-limiter still apply on top.
            JWKSource<SecurityContext> keySource =
                JWKSourceBuilder.create(new URL(jwksUrl)).retrying(true).build();
            this.keySource = keySource;
            ConfigurableJWTProcessor<SecurityContext> p = new DefaultJWTProcessor<>();
            p.setJWSKeySelector(new JWSVerificationKeySelector<>(
                Set.of(JWSAlgorithm.ES256, JWSAlgorithm.RS256), keySource));
            // NB: java.util.Set.of(...) throws NPE on .contains(null) probes,
            // which nimbus performs internally — use null-tolerant HashSets.
            p.setJWTClaimsSetVerifier(new DefaultJWTClaimsVerifier<>(
                new java.util.HashSet<>(Set.of("authenticated")), // required audience
                new JWTClaimsSet.Builder().build(),               // no exact-match claims
                new java.util.HashSet<>(Set.of("sub", "exp")),    // required claims
                new java.util.HashSet<>()));                      // no prohibited claims
            this.processor = p;
        } catch (Exception e) {
            throw new IllegalStateException("bad JWKS url: " + jwksUrl, e);
        }
    }

    /**
     * Best-effort eager JWKS fetch so the FIRST real token verification after
     * boot doesn't race the cold remote fetch (which surfaced as a one-off
     * 401 on the very first request after a restart). Non-fatal: if Supabase
     * is unreachable at boot, the retrying source still fetches on first use.
     */
    public void warmUp() {
        try {
            keySource.get(new JWKSelector(new JWKMatcher.Builder().build()), null);
            log.info("supabase JWKS warmed");
        } catch (Exception coldStart) {
            log.warn("supabase JWKS warm-up deferred ({}: {}) — will fetch on first verify",
                coldStart.getClass().getSimpleName(), coldStart.getMessage());
        }
    }

    /** Verify a raw compact JWT; throws {@link AuthException.Unauthorized} on ANY failure. */
    public VerifiedToken verify(String token) {
        try {
            JWTClaimsSet claims = processor.process(token, null);
            String email = claims.getStringClaim("email");
            // Supabase puts profile fields under user_metadata.{name|full_name}
            // and the confirmation flag under user_metadata.email_verified
            // (newer projects may also surface a top-level email_verified).
            String name = null;
            Boolean emailVerified = asBool(claims.getClaim("email_verified"));
            Object meta = claims.getClaim("user_metadata");
            if (meta instanceof java.util.Map<?, ?> m) {
                Object n = m.get("name") != null ? m.get("name") : m.get("full_name");
                name = n == null ? null : n.toString();
                if (emailVerified == null) {
                    emailVerified = asBool(m.get("email_verified"));
                }
            }
            return new VerifiedToken(claims.getSubject(), email, name, emailVerified);
        } catch (Exception invalid) {
            // One uniform 401 — never leak which check failed to a caller.
            throw new AuthException.Unauthorized("invalid or expired access token");
        }
    }

    /** Coerce a JSON claim (Boolean or "true"/"false" string) to Boolean, else null. */
    private static Boolean asBool(Object claim) {
        if (claim instanceof Boolean b) {
            return b;
        }
        if (claim instanceof String s) {
            return Boolean.parseBoolean(s);
        }
        return null;
    }
}
