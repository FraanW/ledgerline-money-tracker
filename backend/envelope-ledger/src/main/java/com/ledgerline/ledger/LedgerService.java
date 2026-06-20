package com.ledgerline.ledger;

import com.ledgerline.platform.db.TenantContext;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * M12 — the never-negative double-entry envelope ledger.
 *
 * <h2>Invariants enforced per transfer</h2>
 * <ol>
 *   <li><b>Sum-to-zero.</b> All {@code LedgerEntry} rows sharing a {@code transferId}
 *       have signed {@code delta}s that sum to exactly zero. Validated in-process
 *       before any INSERT.</li>
 *   <li><b>Never-negative.</b> No envelope of {@code kind = 'user'} may end with a
 *       balance below zero. Checked AFTER acquiring {@code SELECT ... FOR UPDATE}
 *       on the affected user-envelope row(s), against the freshly-summed entry
 *       balance from {@code ledger_entries} (the authoritative source). Pseudo
 *       envelopes (Income, Unallocated, Spent) are exempt — they exist
 *       specifically to anchor the negative/positive other side of a movement.</li>
 *   <li><b>All-or-nothing.</b> Every entry of a transfer commits in ONE database
 *       transaction. Any failure (including a never-negative rejection) throws,
 *       which the surrounding {@code TenantContext.withTenant(...)} TransactionTemplate
 *       turns into a ROLLBACK — nothing is written.</li>
 * </ol>
 *
 * <h2>Why this service has no {@code @Transactional}</h2>
 * The transaction boundary lives in {@link TenantContext#withTenant} — the same
 * {@code TransactionTemplate}-driven entry point that scopes RLS. Driving
 * transactions explicitly through that primitive (rather than declaratively via
 * {@code @Transactional} on this bean) sidesteps the proxy self-invocation
 * footgun: a {@code this.method()} call inside a {@code @Transactional} bean
 * silently bypasses the proxy and runs WITHOUT a transaction — which would
 * silently break both ledger invariants under load. There is no proxy here to
 * bypass; the {@code BEGIN}/{@code COMMIT} happens in {@code withTenant} and the
 * {@code SET LOCAL} for the tenant GUC executes on the same connection before any
 * ledger SQL runs. See {@code context/learning/spring-boot/05-data-and-transactions.md}.
 *
 * <h2>Why JdbcTemplate, not JPA</h2>
 * The locking IS the design. {@code SELECT ... FOR UPDATE} at the exact moment
 * the service reads a user envelope's balance is what serialises concurrent
 * posters against the same envelope. An ORM may reorder, batch, or defer that
 * statement; we use {@link JdbcTemplate} so the statement and its timing are
 * ours to control.
 */
@Service
public class LedgerService {

    private final TenantContext tenantContext;

    public LedgerService(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    // ---------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------

    /**
     * Post a balanced transfer between two envelopes. This is the primitive that
     * implements income arrival ({@code Income -> Unallocated}), allocation
     * ({@code Unallocated -> Groceries}), and re-budget
     * ({@code Groceries -> Fun}). Same primitive, three callsites.
     *
     * <p>The two entries — {@code (from, -amount)} and {@code (to, +amount)} —
     * sum to zero by construction.
     *
     * @param tenantId       the tenant context (sets RLS GUC for this work)
     * @param fromEnvelopeId source envelope (debited)
     * @param toEnvelopeId   destination envelope (credited)
     * @param amountMinor    the positive amount to move, in minor units (paise)
     * @param description    a short description hung on the {@code ledger_transfers} row
     * @return the newly-created {@code transferId}
     * @throws LedgerException.InvalidArguments if amount is non-positive or
     *         endpoints are the same envelope
     * @throws LedgerException.WouldGoNegative  if posting would drive a user
     *         envelope below zero (whole transfer rejected, nothing written)
     */
    public UUID allocate(
        UUID tenantId,
        UUID fromEnvelopeId,
        UUID toEnvelopeId,
        long amountMinor,
        String description
    ) {
        requirePositive(amountMinor);
        if (fromEnvelopeId.equals(toEnvelopeId)) {
            throw new LedgerException.InvalidArguments(
                "from and to envelopes must differ; got " + fromEnvelopeId);
        }
        // NOTE: allocate does NOT pre-touch pseudo envelopes — callers already
        // pass resolved envelope ids (income/unallocated come from
        // ensurePseudoEnvelope() at the callsite). The deadlock-on-first-touch
        // surface is only in postSpend, where the spent pseudo is resolved
        // INSIDE the transfer transaction; that's where the pre-touch goes.
        return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
            List<LegEntry> entries = List.of(
                new LegEntry(fromEnvelopeId, -amountMinor, null),
                new LegEntry(toEnvelopeId,   +amountMinor, null)
            );
            return postTransferInternal(jdbc, description, entries);
        });
    }

    /**
     * Post a spend: debit {@code fromEnvelopeId} by {@code amountMinor}, credit
     * the tenant's {@code Spent} pseudo-envelope by the same amount. The entry on
     * the {@code from} side carries {@code transactionId} so the bank transaction
     * is linked to its ledger movement.
     *
     * <p><b>Idempotent on {@code transactionId}.</b> If a {@code ledger_entries}
     * row already references this {@code transaction_id}, the existing
     * {@code transferId} is returned and nothing new is written. Replays of the
     * same upstream {@code transaction.categorized} event are safe.
     *
     * @return the {@code transferId} (newly-created OR pre-existing on idempotent replay)
     */
    public UUID postSpend(
        UUID tenantId,
        UUID transactionId,
        UUID fromEnvelopeId,
        long amountMinor,
        String description
    ) {
        requirePositive(amountMinor);
        if (transactionId == null) {
            throw new LedgerException.InvalidArguments("transactionId is required for postSpend");
        }
        // Pre-touch pseudo envelopes (income/unallocated/spent) before the main
        // transaction so that the resolver below becomes a simple SELECT and
        // cannot deadlock with concurrent first-touch INSERTs from other threads.
        ensurePseudoEnvelopesForTenant(tenantId);
        try {
            return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
                // ---- idempotency fast-path (sequential replays) ----
                // For the common sequential-replay case (the winner has already
                // committed), one SELECT and we are done. Worf's concurrent
                // first-touch case is handled by the DuplicateKeyException catch
                // OUTSIDE this transaction below — the DB partial UNIQUE
                // uq_ledger_entries_txn_envelope_per_tenant is the true
                // serialisation point and the source of truth.
                try {
                    UUID existing = jdbc.queryForObject(
                        "SELECT transfer_id FROM ledger_entries WHERE transaction_id = ? LIMIT 1",
                        UUID.class,
                        transactionId);
                    return existing;
                } catch (EmptyResultDataAccessException firstTime) {
                    // Not yet posted — fall through to the real work below.
                }

                UUID spentEnvelopeId = new PseudoAccountResolver(jdbc).resolve(EnvelopeKind.spent);
                List<LegEntry> entries = List.of(
                    new LegEntry(fromEnvelopeId, -amountMinor, transactionId),
                    new LegEntry(spentEnvelopeId, +amountMinor, transactionId)
                );
                return postTransferInternal(jdbc, description, entries);
            });
        } catch (DuplicateKeyException raceLost) {
            // Concurrent first-touch race: another thread won the partial
            // UNIQUE on (tenant_id, transaction_id, envelope_id). Our
            // transaction has been rolled back by the surrounding
            // TransactionTemplate; open a NEW one and re-SELECT the winner's
            // transfer_id. From the caller's perspective this is the
            // idempotent no-op contract.
            return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
                jdbc.queryForObject(
                    "SELECT transfer_id FROM ledger_entries WHERE transaction_id = ? LIMIT 1",
                    UUID.class,
                    transactionId));
        }
    }

    /**
     * Period-boundary rollover. For each user envelope of {@code fromPeriod} whose
     * derived balance is positive, ensure a matching envelope exists in
     * {@code toPeriod} (created on demand, same name) and post a balanced transfer
     * that moves the leftover forward.
     *
     * <p>Per ADR-0005, rollover is NOT a special ledger path — each leftover is
     * just another {@code allocate(...)}-style transfer through the same
     * primitive. The sum-to-zero and never-negative invariants cover it
     * unchanged: a rollover only ever moves a non-negative leftover, so neither
     * envelope can be pushed below zero, and the two entries sum to zero by
     * construction.
     *
     * @return the list of {@code transferId}s posted (one per non-zero envelope rolled)
     */
    public List<UUID> rollover(UUID tenantId, String fromPeriod, String toPeriod) {
        if (fromPeriod == null || toPeriod == null || fromPeriod.equals(toPeriod)) {
            throw new LedgerException.InvalidArguments(
                "rollover requires distinct fromPeriod and toPeriod; got "
                    + fromPeriod + " -> " + toPeriod);
        }
        // NOTE: rollover only moves between user envelopes, so it never
        // resolves a pseudo. No pre-touch needed (and pre-touching here would
        // create rows in tenants that have never spent anything — surprising
        // side-effect, no benefit).

        // Step 1 (own transaction): list the source envelopes with positive
        // balances. We do this in its own withTenant block so we don't hold
        // locks across many transfers — each rollover transfer is its own
        // atomic unit (matching the design's "one transfer = one transaction"
        // boundary).
        record RollSource(UUID id, String name, long balanceMinor) {}
        List<RollSource> sources = tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.query(
                """
                SELECT e.id, e.name,
                       COALESCE(SUM(le.delta_minor), 0) AS bal_minor
                FROM envelopes e
                LEFT JOIN ledger_entries le ON le.envelope_id = e.id
                WHERE e.kind = 'user' AND e.period = ?
                GROUP BY e.id, e.name
                HAVING COALESCE(SUM(le.delta_minor), 0) > 0
                """,
                (rs, rowNum) -> new RollSource(
                    UUID.fromString(rs.getString("id")),
                    rs.getString("name"),
                    rs.getLong("bal_minor")),
                fromPeriod));

        List<UUID> transferIds = new ArrayList<>(sources.size());
        for (RollSource src : sources) {
            UUID transferId = tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) -> {
                // Ensure the destination envelope exists for (toPeriod, name).
                UUID destId = ensureUserEnvelopeInternal(jdbc, src.name(), toPeriod);
                List<LegEntry> entries = List.of(
                    new LegEntry(src.id(), -src.balanceMinor(), null),
                    new LegEntry(destId,  +src.balanceMinor(), null)
                );
                return postTransferInternal(
                    jdbc,
                    "rollover " + fromPeriod + " -> " + toPeriod + ": " + src.name(),
                    entries);
            });
            transferIds.add(transferId);
        }
        return transferIds;
    }

    // ---------------------------------------------------------------------
    // Convenience helpers (tenant-scoped envelope CRUD the ledger needs)
    // ---------------------------------------------------------------------

    /**
     * Get-or-create a {@code kind = 'user'} envelope identified by
     * {@code (tenant, name, period)}. Used by tests and by the rollover path.
     */
    public UUID ensureUserEnvelope(UUID tenantId, String name, String period) {
        return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            ensureUserEnvelopeInternal(jdbc, name, period));
    }

    /** Get-or-create the tenant's pseudo-account envelope of the given kind. */
    public UUID ensurePseudoEnvelope(UUID tenantId, EnvelopeKind kind) {
        return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            new PseudoAccountResolver(jdbc).resolve(kind));
    }

    /**
     * Idempotently materialise the three pseudo-account envelopes
     * (Income / Unallocated / Spent) for the tenant in a SINGLE short
     * transaction. Safe to call repeatedly — the underlying
     * {@code INSERT ... ON CONFLICT DO UPDATE} from the resolver handles
     * concurrent first-touches by serialising on V4's
     * {@code uq_envelopes_tenant_pseudo_kind} partial UNIQUE.
     *
     * <h3>Why this exists (Worf, M12 storm test)</h3>
     * {@code postSpend} calls this BEFORE opening its main transfer transaction.
     * The deadlock-on-first-touch finding in
     * {@code LedgerConcurrencyTest#n_way_overspend_storm_caps_successes}
     * traced to N threads racing the {@code INSERT ON CONFLICT} of the
     * {@code spent} pseudo row WHILE separate user-envelope
     * {@code SELECT ... FOR UPDATE} locks were already held — a graph the
     * engine could only resolve by aborting one side as
     * {@code PessimisticLockingFailureException}. Pre-creating the pseudo
     * rows in a self-contained transaction means the resolver inside the
     * main transfer becomes a simple SELECT (no INSERT, no lock contention),
     * collapsing the lock graph to a chain — no deadlock possible.
     *
     * <p>Pseudo envelopes are tenant-lifecycle state (one row per
     * (tenant, kind), lifetime = tenant's), so eager creation is the natural
     * model anyway. {@code allocate} and {@code rollover} do NOT call this:
     * {@code allocate} receives already-resolved envelope ids from the
     * caller, and {@code rollover} only ever moves between user envelopes.
     */
    public void ensurePseudoEnvelopesForTenant(UUID tenantId) {
        tenantContext.withTenant(tenantId, (java.util.function.Consumer<JdbcTemplate>) jdbc -> {
            PseudoAccountResolver resolver = new PseudoAccountResolver(jdbc);
            resolver.resolve(EnvelopeKind.income);
            resolver.resolve(EnvelopeKind.unallocated);
            resolver.resolve(EnvelopeKind.spent);
        });
    }

    /**
     * Derived balance of {@code envelopeId} (sum of its ledger_entries.delta_minor).
     * Runs inside the tenant transaction; RLS scopes both the envelope and the
     * entries to the current tenant. Returns 0 for an envelope with no entries.
     */
    public long balanceMinor(UUID tenantId, UUID envelopeId) {
        return tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.queryForObject(
                "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries WHERE envelope_id = ?",
                Long.class,
                envelopeId));
    }

    // ---------------------------------------------------------------------
    // Internal: the transfer primitive
    // ---------------------------------------------------------------------

    /**
     * The single primitive every public method funnels through. Invariants are
     * enforced HERE; every transfer in the system goes through this code path,
     * so there is exactly one place to audit for ledger correctness.
     *
     * <p>Sequence (all inside the caller's open transaction):
     * <ol>
     *   <li>Sum-to-zero check on the in-memory entry list.</li>
     *   <li>Identify the user-kind envelopes touched (pseudo envelopes skipped).
     *       For each, {@code SELECT ... FOR UPDATE} the {@code envelopes} row to
     *       acquire a row-level exclusive lock. Locks are taken in ascending
     *       envelope-id order to give a deterministic acquisition sequence
     *       across concurrent posters (avoids cyclic deadlocks).</li>
     *   <li>For each user envelope: re-compute its CURRENT derived balance from
     *       {@code ledger_entries} (authoritative source). If
     *       {@code current + sum_of_deltas_for_this_envelope_in_this_transfer < 0}
     *       throw {@link LedgerException.WouldGoNegative}. The exception
     *       propagates out of {@code withTenant}, which triggers ROLLBACK —
     *       nothing is written.</li>
     *   <li>INSERT the {@code ledger_transfers} parent row, then INSERT each
     *       {@code ledger_entries} row.</li>
     *   <li>UPDATE {@code envelopes.balance_minor} for every touched envelope to
     *       keep the materialised column in sync (denormalised cache; the
     *       authoritative balance is always the entry SUM, but the column is
     *       useful for fast list-views and is kept consistent here).</li>
     * </ol>
     */
    private UUID postTransferInternal(JdbcTemplate jdbc, String description, List<LegEntry> entries) {
        // ---- 1. Sum-to-zero invariant (cheap, in-memory) ----
        long sum = 0;
        for (LegEntry e : entries) {
            sum = Math.addExact(sum, e.deltaMinor());
        }
        if (sum != 0) {
            throw new LedgerException.NotBalanced(sum);
        }

        // ---- 2. Acquire row-level locks on user-kind envelopes only ----
        // Collect per-envelope net delta (an envelope may legitimately appear
        // more than once if a single transfer touches it twice — the per-row
        // never-negative check is against the net change for that row).
        java.util.Map<UUID, Long> netByEnvelope = new java.util.LinkedHashMap<>();
        for (LegEntry e : entries) {
            netByEnvelope.merge(e.envelopeId(), e.deltaMinor(), Math::addExact);
        }
        // Sort envelope ids for deterministic lock-acquisition order.
        List<UUID> sortedEnvelopeIds = new ArrayList<>(netByEnvelope.keySet());
        sortedEnvelopeIds.sort(java.util.Comparator.comparing(UUID::toString));

        // Lock each envelope row and capture its kind in one round-trip.
        // The FOR UPDATE here is the never-negative serialisation point:
        // concurrent transactions touching the same envelope row WILL block
        // here until the holder commits, then re-read the fresh balance.
        record LockedEnvelope(UUID id, String kind) {}
        java.util.Map<UUID, LockedEnvelope> locked = new java.util.HashMap<>();
        for (UUID envelopeId : sortedEnvelopeIds) {
            try {
                LockedEnvelope row = jdbc.queryForObject(
                    "SELECT id, kind::text AS kind FROM envelopes WHERE id = ? FOR UPDATE",
                    (rs, rowNum) -> new LockedEnvelope(
                        UUID.fromString(rs.getString("id")),
                        rs.getString("kind")),
                    envelopeId);
                locked.put(envelopeId, row);
            } catch (EmptyResultDataAccessException missing) {
                throw new LedgerException.InvalidArguments(
                    "envelope " + envelopeId + " does not exist in the current tenant");
            }
        }

        // ---- 3. Never-negative check, ONLY for user-kind envelopes ----
        // Authoritative current balance = SUM(delta_minor) over ledger_entries.
        // The lock taken above guarantees no concurrent transaction can insert
        // new entries for this envelope between the SUM and our INSERTs below.
        for (var entry : netByEnvelope.entrySet()) {
            UUID envelopeId = entry.getKey();
            long netDelta = entry.getValue();
            LockedEnvelope row = locked.get(envelopeId);
            if (!"user".equals(row.kind())) {
                continue;  // pseudo-accounts (income/unallocated/spent) skip never-negative
            }
            long currentMinor = jdbc.queryForObject(
                "SELECT COALESCE(SUM(delta_minor), 0) FROM ledger_entries WHERE envelope_id = ?",
                Long.class,
                envelopeId);
            long projected = Math.addExact(currentMinor, netDelta);
            if (projected < 0) {
                throw new LedgerException.WouldGoNegative(envelopeId, currentMinor, netDelta);
            }
        }

        // ---- 4. INSERT ledger_transfers parent + ledger_entries children ----
        UUID transferId = jdbc.queryForObject(
            "INSERT INTO ledger_transfers (tenant_id, description) "
                + "VALUES (NULLIF(current_setting('app.current_tenant', true), '')::uuid, ?) "
                + "RETURNING id",
            UUID.class,
            description);

        for (LegEntry e : entries) {
            jdbc.update(
                "INSERT INTO ledger_entries "
                    + "(tenant_id, transfer_id, envelope_id, delta_minor, transaction_id) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?, ?, ?, ?"
                    + ")",
                transferId,
                e.envelopeId(),
                e.deltaMinor(),
                e.transactionId());
        }

        // ---- 5. Keep envelopes.balance_minor in sync (denorm cache) ----
        // Not authoritative — the balance of record is the SUM(delta_minor)
        // over ledger_entries — but consistent for fast list-view reads.
        for (var entry : netByEnvelope.entrySet()) {
            jdbc.update(
                "UPDATE envelopes SET balance_minor = balance_minor + ? WHERE id = ?",
                entry.getValue(),
                entry.getKey());
        }

        return transferId;
    }

    private UUID ensureUserEnvelopeInternal(JdbcTemplate jdbc, String name, String period) {
        try {
            return jdbc.queryForObject(
                "SELECT id FROM envelopes WHERE kind = 'user' AND name = ? AND period = ?",
                UUID.class,
                name, period);
        } catch (EmptyResultDataAccessException missing) {
            return jdbc.queryForObject(
                "INSERT INTO envelopes (tenant_id, name, period, kind, balance_minor) "
                    + "VALUES ("
                    + "  NULLIF(current_setting('app.current_tenant', true), '')::uuid, "
                    + "  ?, ?, 'user', 0"
                    + ") RETURNING id",
                UUID.class,
                name, period);
        }
    }

    private static void requirePositive(long amountMinor) {
        if (amountMinor <= 0) {
            throw new LedgerException.InvalidArguments(
                "amount must be > 0 (got " + amountMinor + " minor units)");
        }
    }

    /**
     * One leg of a transfer: a {@code (envelope, signed delta, optional txn link)}
     * tuple. Package-private — public callers build these implicitly through the
     * service's typed methods.
     */
    private record LegEntry(UUID envelopeId, long deltaMinor, UUID transactionId) {}
}
