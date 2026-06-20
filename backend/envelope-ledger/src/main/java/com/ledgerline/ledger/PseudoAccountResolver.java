package com.ledgerline.ledger;

import java.util.UUID;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Helper that resolves (and lazily creates) a tenant's pseudo-account envelope
 * rows — Income, Unallocated, Spent — used as the double-entry counterparts of
 * every income arrival, allocation, and spend.
 *
 * <p>Pseudo-accounts are NOT period-scoped: one row per (tenant_id, kind). V4's
 * partial unique index enforces that. Their {@code period} column carries the
 * sentinel string {@code "system"} purely so the schema's NOT NULL is satisfied.
 *
 * <p>This helper is invoked from inside an open transaction (the caller already
 * runs inside {@code TenantContext.withTenant(...)}) and uses the SAME
 * {@link JdbcTemplate} as the rest of the transfer work, so the RLS context is
 * already set and there is no separate transaction. The lazy create-if-missing
 * is single-statement and serialised by the (tenant_id, kind) UNIQUE index — a
 * race produces a constraint violation on one side, which we recover from with a
 * follow-up SELECT.
 */
final class PseudoAccountResolver {

    private final JdbcTemplate jdbc;

    PseudoAccountResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Return the envelope id for the given pseudo-kind under the current
     * tenant context (set by {@code TenantContext.withTenant}). Creates the row
     * on first use; subsequent calls within the same tenant just SELECT it.
     */
    UUID resolve(EnvelopeKind kind) {
        if (kind == EnvelopeKind.user) {
            throw new IllegalArgumentException("resolve() is for pseudo-kinds only, not 'user'");
        }
        // The RLS policy gates this SELECT to the current tenant — no explicit
        // tenant_id filter needed (and no risk of leakage across tenants).
        try {
            return jdbc.queryForObject(
                "SELECT id FROM envelopes WHERE kind = ?::envelope_kind LIMIT 1",
                UUID.class,
                kind.name());
        } catch (EmptyResultDataAccessException missing) {
            // First touch for this (tenant, kind) — create the row. tenant_id
            // is sourced from the RLS GUC via a sub-select so we don't have to
            // thread the tenant UUID through this layer.
            UUID id = jdbc.queryForObject(
                "INSERT INTO envelopes (tenant_id, name, period, kind, balance_minor) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?, 'system', ?::envelope_kind, 0"
                    + ") "
                    + "ON CONFLICT (tenant_id, kind) WHERE kind <> 'user' DO UPDATE "
                    + "  SET name = envelopes.name "  // no-op update so RETURNING gets the existing row
                    + "RETURNING id",
                UUID.class,
                pseudoName(kind),
                kind.name());
            return id;
        }
    }

    private static String pseudoName(EnvelopeKind kind) {
        return switch (kind) {
            case income -> "__income__";
            case unallocated -> "__unallocated__";
            case spent -> "__spent__";
            case user -> throw new IllegalStateException("unreachable");
        };
    }
}
