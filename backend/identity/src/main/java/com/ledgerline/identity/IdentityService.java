package com.ledgerline.identity;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Control-plane identity operations (migrations V7/V8/V9, ADR-0011).
 *
 * <h2>Control-plane vs tenant-scoped — read this first</h2>
 * {@code users} provisioning is a CONTROL-PLANE operation: the app role has no
 * INSERT grant on {@code users} (by design — V7), so {@link #provisionUser}
 * and {@link #listMemberships} must run on the privileged/owner connection.
 * That connection is the DEDICATED control-plane DataSource wired by
 * {@link IdentityConfig} (properties {@code ledgerline.control-plane.*}) —
 * NOT the runtime pool, which connects as the RLS-constrained
 * {@code ledgerline_app} role. This class is deliberately not
 * {@code @Service}-annotated; {@link IdentityConfig} constructs it.
 *
 * <p>{@link #createWorkspace} is a hybrid: the {@code tenants} INSERT is
 * control-plane (no RLS on {@code tenants}), and the {@code tenant_settings}
 * + first-membership INSERTs run INSIDE {@link TenantContext#withTenantAndUser}
 * so the V7/V9 WITH CHECK policies hold even under the app role.
 *
 * <h2>Idempotency</h2>
 * {@link #provisionUser} upserts by email ({@code ON CONFLICT (email)}):
 * calling it on every sign-in is safe — it links {@code auth_subject} on
 * first contact and never clobbers an existing link or display name.
 */
public class IdentityService {

    private final TransactionTemplate controlPlaneTx;
    private final JdbcTemplate controlPlaneJdbc;
    private final TenantContext tenantContext;

    public IdentityService(
        PlatformTransactionManager txManager,
        DataSource dataSource,
        TenantContext tenantContext
    ) {
        this.controlPlaneTx = new TransactionTemplate(txManager);
        this.controlPlaneJdbc = new JdbcTemplate(dataSource);
        this.tenantContext = tenantContext;
    }

    /**
     * Upsert a user by email and ensure their default {@code user_settings}
     * row exists. Idempotent: re-provisioning returns the same user id.
     *
     * @param authSubject the Supabase {@code auth.users.id} (nullable until
     *                    real auth lands; linked on first non-null call)
     * @return the user's id
     */
    public UUID provisionUser(UUID authSubject, String email, String displayName) {
        return controlPlaneTx.execute(status -> {
            UUID userId = controlPlaneJdbc.queryForObject(
                """
                INSERT INTO users (auth_subject, email, display_name)
                VALUES (?, ?, ?)
                ON CONFLICT (email) DO UPDATE
                  SET auth_subject = COALESCE(users.auth_subject, EXCLUDED.auth_subject),
                      updated_at   = now()
                RETURNING id
                """,
                UUID.class,
                authSubject,
                email,
                displayName);

            // Default settings row — created once, never reset on re-provision.
            controlPlaneJdbc.update(
                "INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING",
                userId);

            return userId;
        });
    }

    /**
     * Create a workspace (tenant) owned by {@code ownerUserId}: the tenant
     * row, its {@code tenant_settings}, and the first {@code owner}
     * membership. Pseudo envelopes are NOT pre-created here — the M12
     * {@code LedgerService} creates them lazily on first use.
     *
     * @return the new tenant's id
     */
    public UUID createWorkspace(UUID ownerUserId, String displayName) {
        // Control-plane: tenants carries no RLS (V2) — a plain INSERT.
        UUID tenantId = controlPlaneTx.execute(status ->
            controlPlaneJdbc.queryForObject(
                "INSERT INTO tenants (display_name) VALUES (?) RETURNING id",
                UUID.class,
                displayName));

        // Tenant-scoped: settings + the bootstrap membership, under the new
        // tenant's GUC so the V7/V9 WITH CHECK policies are satisfied even
        // when this runs as the non-superuser app role.
        tenantContext.withTenantAndUser(tenantId, ownerUserId, jdbc -> {
            jdbc.update(
                "INSERT INTO tenant_settings (tenant_id) VALUES (?)",
                tenantId);

            UUID ownerRoleId = jdbc.queryForObject(
                "SELECT id FROM roles WHERE tenant_id IS NULL AND key = 'owner'",
                UUID.class);

            jdbc.update(
                """
                INSERT INTO memberships (user_id, tenant_id, role_id, status)
                VALUES (?, ?, ?, 'active'::membership_status)
                """,
                ownerUserId,
                tenantId,
                ownerRoleId);
        });

        return tenantId;
    }

    /**
     * Map a VERIFIED Supabase subject to our user id — the JWT landing path
     * (Sweep 4). Fast path: lookup by {@code auth_subject}. First sight:
     * upsert by email (links the subject via the provisioning COALESCE).
     */
    public UUID findOrProvisionByAuthSubject(
        UUID authSubject, String email, String displayName, Boolean emailVerified) {
        List<UUID> existing = controlPlaneJdbc.query(
            "SELECT id FROM users WHERE auth_subject = ?",
            (rs, i) -> UUID.fromString(rs.getString("id")),
            authSubject);
        if (!existing.isEmpty()) {
            return existing.get(0); // already linked — fast path, no re-check
        }
        if (email == null || email.isBlank()) {
            // A token without an email claim and an unknown subject — nothing
            // safe to upsert by. (Anonymous sign-ins are not supported.)
            throw new AuthException.Unauthorized("token has no email claim and no known subject");
        }
        // PROVISIONING / LINK path: this binds an auth subject to a users row
        // by EMAIL (incl. a pre-provisioned invite row with auth_subject NULL).
        // Require the email to be verified so an unverified address cannot bind
        // to (take over) a row (Tasha finding #5). Already-linked users skip
        // this via the fast path above.
        if (!Boolean.TRUE.equals(emailVerified)) {
            throw new AuthException.Unauthorized("email is not verified");
        }
        String name = (displayName == null || displayName.isBlank())
            ? email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length())
            : displayName.trim();
        return provisionUser(authSubject, email.trim(), name);
    }

    /** Control-plane read of a user's public profile fields. */
    public Optional<UserView> getUser(UUID userId) {
        List<UserView> rows = controlPlaneJdbc.query(
            "SELECT id, email, display_name FROM users WHERE id = ?",
            (rs, i) -> new UserView(
                UUID.fromString(rs.getString("id")),
                rs.getString("email"),
                rs.getString("display_name")),
            userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /** A user's public profile fields. */
    public record UserView(UUID id, String email, String displayName) {}

    /**
     * All memberships for a user, across tenants — the "pick your workspace"
     * read at login. Control-plane by necessity: before a tenant is chosen
     * there is no tenant GUC, and {@code memberships} is FORCE-RLS.
     */
    public List<MembershipView> listMemberships(UUID userId) {
        return controlPlaneJdbc.query(
            """
            SELECT m.tenant_id, t.display_name, r.key AS role_key, m.status
            FROM memberships m
            JOIN tenants t ON t.id = m.tenant_id
            JOIN roles   r ON r.id = m.role_id
            WHERE m.user_id = ?
            ORDER BY m.joined_at
            """,
            (rs, i) -> new MembershipView(
                UUID.fromString(rs.getString("tenant_id")),
                rs.getString("display_name"),
                rs.getString("role_key"),
                rs.getString("status")),
            userId);
    }
}
