package com.ledgerline.platform.db;

import java.util.UUID;
import java.util.function.Function;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The RLS tenant-context mechanism — the Java successor to the TS
 * {@code packages/db-client} {@code withTenant} helper.
 *
 * <p>{@link #withTenant(UUID, Function)} opens a single transaction, sets the
 * per-connection tenant GUC {@code app.current_tenant} via
 * {@code SELECT set_config('app.current_tenant', ?, true)} (the {@code true}
 * makes it transaction-LOCAL — the parameterisable equivalent of
 * {@code SET LOCAL}), then runs the supplied work bound to a {@link JdbcTemplate}
 * that uses the SAME connection. The M5 RLS policies then filter every query in
 * the callback. On commit/rollback the GUC is released automatically, so a
 * pooled connection handed to the next caller never leaks a stale tenant.
 *
 * <h2>Why transaction-scoped, never ThreadLocal</h2>
 * A {@code ThreadLocal}-held tenant id is unsafe with a connection pool: the GUC
 * lives on the physical connection, the ThreadLocal lives on the thread, and the
 * two can desync (a connection reused on another thread, or a thread reused for
 * another tenant). Binding the tenant to the transaction — the same unit that
 * owns the connection and the {@code SET LOCAL} lifetime — keeps the GUC and the
 * work strictly in lockstep. There is no tenant state outside the transaction.
 *
 * <h2>Why not JPA for this path</h2>
 * We drive the transaction explicitly through {@link TransactionTemplate} and run
 * SQL through {@link JdbcTemplate}. This avoids the JPA {@code @Transactional}
 * self-invocation proxy trap and ORM flush-ordering surprises — critical for the
 * ledger posting path where the {@code set_config} MUST execute before any
 * tenant-scoped statement on the same connection, with no hidden reordering.
 */
@Component
public class TenantContext {

    private final TransactionTemplate transactionTemplate;
    private final JdbcTemplate jdbcTemplate;

    public TenantContext(PlatformTransactionManager txManager, DataSource dataSource) {
        this.transactionTemplate = new TransactionTemplate(txManager);
        // A JdbcTemplate over the same DataSource. Because the work runs inside
        // the TransactionTemplate's transaction, Spring binds this JdbcTemplate
        // to that transaction's connection — the SET LOCAL and the work share
        // one physical connection, which is exactly what RLS requires.
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    /**
     * Run {@code work} inside a transaction scoped to {@code tenantId}. Every
     * query the work issues through the provided {@link JdbcTemplate} is filtered
     * by the M5 RLS policies for that tenant.
     *
     * @param tenantId the tenant whose context the work runs under
     * @param work     receives a transaction-bound {@link JdbcTemplate}
     * @param <T>      the work's return type
     * @return the work's result; the transaction commits on normal return and
     *         rolls back if the work throws
     */
    public <T> T withTenant(UUID tenantId, Function<JdbcTemplate, T> work) {
        return transactionTemplate.execute((TransactionCallback<T>) status -> {
            applyTenant(tenantId);
            return work.apply(jdbcTemplate);
        });
    }

    /** Void overload for work that performs side effects only. */
    public void withTenant(UUID tenantId, java.util.function.Consumer<JdbcTemplate> work) {
        transactionTemplate.executeWithoutResult((TransactionStatus status) -> {
            applyTenant(tenantId);
            work.accept(jdbcTemplate);
        });
    }

    /**
     * Run {@code work} inside a transaction scoped to BOTH {@code tenantId} and
     * the acting {@code userId} (V7's second GUC, {@code app.current_user_id}).
     * The tenant GUC drives the V3-style tenant-isolation policies exactly as
     * {@link #withTenant(UUID, Function)}; the user GUC additionally satisfies
     * the self-visibility policies on {@code users} / {@code user_settings}
     * (migrations V7/V8), so identity-aware request paths use this overload.
     */
    public <T> T withTenantAndUser(UUID tenantId, UUID userId, Function<JdbcTemplate, T> work) {
        return transactionTemplate.execute((TransactionCallback<T>) status -> {
            applyTenant(tenantId);
            applyUser(userId);
            return work.apply(jdbcTemplate);
        });
    }

    /** Void overload of {@link #withTenantAndUser(UUID, UUID, Function)}. */
    public void withTenantAndUser(UUID tenantId, UUID userId, java.util.function.Consumer<JdbcTemplate> work) {
        transactionTemplate.executeWithoutResult((TransactionStatus status) -> {
            applyTenant(tenantId);
            applyUser(userId);
            work.accept(jdbcTemplate);
        });
    }

    /**
     * Run {@code work} scoped to a USER only — no tenant GUC. For self-scoped
     * reads/writes ({@code user_settings}, the user's own {@code users} row)
     * outside any workspace context. Tenant-scoped tables are invisible inside
     * this transaction (the tenant GUC is unset, so RLS fails closed).
     */
    public <T> T withUser(UUID userId, Function<JdbcTemplate, T> work) {
        return transactionTemplate.execute((TransactionCallback<T>) status -> {
            applyUser(userId);
            return work.apply(jdbcTemplate);
        });
    }

    /** Void overload of {@link #withUser(UUID, Function)}. */
    public void withUser(UUID userId, java.util.function.Consumer<JdbcTemplate> work) {
        transactionTemplate.executeWithoutResult((TransactionStatus status) -> {
            applyUser(userId);
            work.accept(jdbcTemplate);
        });
    }

    /**
     * Bind the tenant id to the current transaction's connection via a
     * parameterised, transaction-local {@code set_config}. The id is passed as a
     * bind parameter (never string-interpolated), and {@code is_local = true}
     * scopes it to this transaction only.
     */
    private void applyTenant(UUID tenantId) {
        jdbcTemplate.queryForObject(
            "SELECT set_config('app.current_tenant', ?, true)",
            String.class,
            tenantId.toString());
    }

    /** Same mechanism for the acting user's id ({@code app.current_user_id}, V7). */
    private void applyUser(UUID userId) {
        jdbcTemplate.queryForObject(
            "SELECT set_config('app.current_user_id', ?, true)",
            String.class,
            userId.toString());
    }
}
