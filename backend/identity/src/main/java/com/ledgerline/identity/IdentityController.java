package com.ledgerline.identity;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * The v0 HTTP front door for identity (control plane).
 *
 * <p>Same explicit v0 posture as the M1 ingestion controller: NO JWT
 * validation yet — these endpoints trust their inputs the way ingestion
 * trusts {@code X-Tenant-Id}. When Supabase JWT validation lands, the
 * {@code authSubject} comes from the verified token's {@code sub} and these
 * endpoints stop accepting it from the body — the services do not change.
 *
 * <h2>Endpoints</h2>
 * <pre>
 * POST /api/v0/identity/users        {email, displayName, authSubject?} → {userId}
 * POST /api/v0/identity/workspaces   {ownerUserId, displayName}         → {tenantId}
 * GET  /api/v0/identity/users/{id}/memberships → [{tenantId, tenantName, role, status}]
 * </pre>
 */
@RestController
public class IdentityController {

    private static final Logger log = LoggerFactory.getLogger(IdentityController.class);

    private final IdentityService identityService;
    private final ActingUserResolver actingUser;

    public IdentityController(IdentityService identityService, ActingUserResolver actingUser) {
        this.identityService = identityService;
        this.actingUser = actingUser;
    }

    /**
     * THE login endpoint of the JWT era: a verified bearer token in, the
     * caller's identity + workspaces out. Auto-provisions our {@code users}
     * row on first sight (linking {@code auth_subject}), so a fresh Supabase
     * sign-up becomes a Ledgerline user on their first call.
     *
     * <pre>GET /api/v0/identity/me   (Authorization: Bearer &lt;supabase jwt&gt;)
     * → {userId, email, displayName, memberships:[{tenantId, tenantName, role, status}]}</pre>
     */
    @GetMapping(value = "/api/v0/identity/me", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> me(
        @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        UUID userId = actingUser.requireBearer(authorization);
        IdentityService.UserView user = identityService.getUser(userId)
            .orElseThrow(() -> new AuthException.Unauthorized("user vanished mid-request"));
        java.util.LinkedHashMap<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("userId", user.id());
        body.put("email", user.email());
        body.put("displayName", user.displayName());
        body.put("memberships", identityService.listMemberships(userId));
        return ResponseEntity.ok(body);
    }

    /** {email, displayName, authSubject?} — authSubject optional until real auth. */
    public record ProvisionUserRequest(String email, String displayName, UUID authSubject) {}

    /** {ownerUserId, displayName} — the creating user becomes the owner. */
    public record CreateWorkspaceRequest(UUID ownerUserId, String displayName) {}

    /**
     * DEV-ONLY user provisioning (keyless local mode). Under real auth,
     * provisioning is automatic inside {@link #me} on first sign-in, so this
     * unauthenticated endpoint is REFUSED — leaving it open let anyone mint
     * users (Tasha finding #1).
     */
    @PostMapping(
        value = "/api/v0/identity/users",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> provisionUser(@RequestBody ProvisionUserRequest req) {
        if (actingUser.realAuthEnabled()) {
            return ResponseEntity.status(403).body(Map.of(
                "error", "provisioning is automatic via sign-in; this endpoint is disabled under bearer auth"));
        }
        if (req.email() == null || req.email().isBlank() || !req.email().contains("@")) {
            return badRequest("email is required and must look like an email");
        }
        if (req.displayName() == null || req.displayName().isBlank()) {
            return badRequest("displayName is required");
        }
        UUID userId = identityService.provisionUser(
            req.authSubject(), req.email().trim(), req.displayName().trim());
        log.info("provisioned user={} (dev mode)", userId);
        return ResponseEntity.ok(Map.of("userId", userId));
    }

    /**
     * Create a workspace owned by the ACTING user. Under real auth the owner
     * is taken from the verified bearer token — the request body can no longer
     * name an arbitrary {@code ownerUserId} (Tasha finding #1). In keyless dev
     * mode the body's ownerUserId is trusted (there is no token to derive from).
     */
    @PostMapping(
        value = "/api/v0/identity/workspaces",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> createWorkspace(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @RequestBody CreateWorkspaceRequest req
    ) {
        if (req.displayName() == null || req.displayName().isBlank()) {
            return badRequest("displayName is required");
        }
        final UUID owner;
        if (actingUser.realAuthEnabled()) {
            owner = actingUser.requireBearer(authorization); // identity from the token, never the body
        } else {
            if (req.ownerUserId() == null) {
                return badRequest("ownerUserId is required");
            }
            owner = req.ownerUserId();
        }
        UUID tenantId = identityService.createWorkspace(owner, req.displayName().trim());
        log.info("created workspace tenant={} owner={}", tenantId, owner);
        return ResponseEntity.ok(Map.of("tenantId", tenantId));
    }

    /**
     * A user's memberships. Under real auth this is SELF-ONLY (bearer-derived
     * id must equal the path id) — the open version was an IDOR letting anyone
     * enumerate any user's workspaces (Tasha finding #1). The real login flow
     * uses {@link #me}; this remains for the keyless dev workspace-picker.
     */
    @GetMapping(
        value = "/api/v0/identity/users/{userId}/memberships",
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public ResponseEntity<?> listMemberships(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable UUID userId
    ) {
        if (actingUser.realAuthEnabled()) {
            UUID acting = actingUser.requireBearer(authorization);
            if (!acting.equals(userId)) {
                return ResponseEntity.status(403).body(Map.of("error", "forbidden"));
            }
        }
        return ResponseEntity.ok(identityService.listMemberships(userId));
    }

    private static ResponseEntity<Map<String, String>> badRequest(String message) {
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }
}
