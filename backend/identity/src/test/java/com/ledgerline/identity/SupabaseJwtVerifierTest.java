package com.ledgerline.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

/**
 * Sweep 4 finale — the Supabase token verifier, tested against a SELF-SIGNED
 * ES256 keypair served from an in-JVM JWKS endpoint (this test IS Supabase).
 * No network, no secrets: asymmetric verification means the test holds the
 * private key and the verifier only ever sees the public JWKS — exactly the
 * production trust model.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SupabaseJwtVerifierTest {

    private HttpServer jwksServer;
    private ECKey signingKey;     // the "Supabase" keypair
    private ECKey strangerKey;    // an attacker's keypair, never published
    private SupabaseJwtVerifier verifier;

    @BeforeAll
    void setUp() throws Exception {
        signingKey = new ECKeyGenerator(Curve.P_256).keyID("test-kid").generate();
        strangerKey = new ECKeyGenerator(Curve.P_256).keyID("evil-kid").generate();

        String jwksJson = new JWKSet(List.of(signingKey.toPublicJWK())).toString();
        jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwksServer.createContext("/auth/v1/.well-known/jwks.json", exchange -> {
            byte[] bytes = jwksJson.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        jwksServer.start();

        verifier = new SupabaseJwtVerifier(
            "http://127.0.0.1:" + jwksServer.getAddress().getPort()
                + "/auth/v1/.well-known/jwks.json");
    }

    @AfterAll
    void tearDown() {
        if (jwksServer != null) {
            jwksServer.stop(0);
        }
    }

    // =====================================================================

    @Test
    @DisplayName("a properly signed Supabase-shaped token verifies: sub + email + metadata name out")
    void valid_token_verifies() throws Exception {
        String sub = UUID.randomUUID().toString();
        String token = sign(signingKey, claims(sub)
            .claim("email", "anaya@demo.ledgerline")
            .claim("user_metadata", Map.of("name", "Anaya Sharma"))
            .build());

        SupabaseJwtVerifier.VerifiedToken out = verifier.verify(token);
        assertThat(out.subject()).isEqualTo(sub);
        assertThat(out.email()).isEqualTo("anaya@demo.ledgerline");
        assertThat(out.displayName()).isEqualTo("Anaya Sharma");
    }

    @Test
    @DisplayName("an EXPIRED token is refused")
    void expired_token_refused() throws Exception {
        String token = sign(signingKey, new JWTClaimsSet.Builder()
            .subject(UUID.randomUUID().toString())
            .audience("authenticated")
            .expirationTime(new Date(System.currentTimeMillis() - 600_000)) // 10 min ago
            .build());
        assertThatThrownBy(() -> verifier.verify(token))
            .isInstanceOf(AuthException.Unauthorized.class);
    }

    @Test
    @DisplayName("a token signed by a key NOT in the JWKS is refused")
    void stranger_signature_refused() throws Exception {
        String token = sign(strangerKey, claims(UUID.randomUUID().toString()).build());
        assertThatThrownBy(() -> verifier.verify(token))
            .isInstanceOf(AuthException.Unauthorized.class);
    }

    @Test
    @DisplayName("a token without the 'authenticated' audience is refused")
    void wrong_audience_refused() throws Exception {
        String token = sign(signingKey, new JWTClaimsSet.Builder()
            .subject(UUID.randomUUID().toString())
            .audience("anon")
            .expirationTime(new Date(System.currentTimeMillis() + 3_600_000))
            .build());
        assertThatThrownBy(() -> verifier.verify(token))
            .isInstanceOf(AuthException.Unauthorized.class);
    }

    @Test
    @DisplayName("garbage is refused, not 500'd")
    void garbage_refused() {
        assertThatThrownBy(() -> verifier.verify("not.a.jwt"))
            .isInstanceOf(AuthException.Unauthorized.class);
    }

    // =====================================================================

    private static JWTClaimsSet.Builder claims(String sub) {
        return new JWTClaimsSet.Builder()
            .subject(sub)
            .audience("authenticated")
            .issueTime(new Date())
            .expirationTime(new Date(System.currentTimeMillis() + 3_600_000));
    }

    private static String sign(ECKey key, JWTClaimsSet claims) throws Exception {
        SignedJWT jwt = new SignedJWT(
            new JWSHeader.Builder(JWSAlgorithm.ES256)
                .keyID(key.getKeyID())
                .type(JOSEObjectType.JWT)
                .build(),
            claims);
        jwt.sign(new ECDSASigner(key));
        return jwt.serialize();
    }
}
