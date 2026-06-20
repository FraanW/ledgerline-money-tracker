package com.ledgerline.api;

import com.ledgerline.ledger.EnvelopeKind;
import com.ledgerline.ledger.LedgerService;
import com.ledgerline.platform.db.TenantContext;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The budget surface — envelopes + money movements. ALL movements delegate to
 * {@link LedgerService} so the M12 invariants (double-entry, never-negative)
 * live in exactly one place; this controller never writes ledger rows itself.
 *
 * <pre>
 * GET  /api/v0/budget?period=2026-06        → envelopes + pseudo balances  (envelope:read)
 * POST /api/v0/budget/envelopes             {name, period, categoryId?}    (envelope:write)
 * POST /api/v0/budget/income                {amountMinor, description?}    (envelope:write)
 *        income pseudo → Unallocated — how money ENTERS the budget
 * POST /api/v0/budget/allocate              {toEnvelopeId, amountMinor,
 *                                            fromEnvelopeId?, description?} (envelope:write)
 *        default source = Unallocated. Draining a USER envelope below zero →
 *        422 would_go_negative; Unallocated itself MAY go negative by design
 *        (V4: pseudo envelopes are exempt, so over-budgeting stays visible
 *        rather than blocked — the UI surfaces it as a warning).
 * </pre>
 */
@RestController
public class BudgetController {

    private final ApiGate gate;
    private final TenantContext tenantContext;
    private final LedgerService ledger;

    public BudgetController(ApiGate gate, TenantContext tenantContext, LedgerService ledger) {
        this.gate = gate;
        this.tenantContext = tenantContext;
        this.ledger = ledger;
    }

    public record EnvelopeItem(UUID id, String name, long balanceMinor, UUID categoryId) {}

    public record CreateEnvelopeRequest(String name, String period, UUID categoryId) {}

    public record IncomeRequest(Long amountMinor, String description) {}

    public record AllocateRequest(UUID toEnvelopeId, Long amountMinor, UUID fromEnvelopeId, String description) {}

    @GetMapping(value = "/api/v0/budget", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> view(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestParam(required = false) String period
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "envelope:read");
        String p = (period == null || period.isBlank()) ? currentPeriod() : period.trim();
        if (!p.matches("\\d{4}-\\d{2}")) {
            throw new ApiException.BadRequest("period must be yyyy-MM");
        }

        // Pseudo envelopes are created lazily by M12; touching them here keeps
        // the very first GET /budget from showing an empty world.
        ledger.ensurePseudoEnvelopesForTenant(scope.tenantId());

        return tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            List<EnvelopeItem> envelopes = jdbc.query(
                """
                SELECT id, name, balance_minor, category_id
                FROM envelopes WHERE tenant_id = ? AND kind = 'user' AND period = ? ORDER BY name
                """,
                (rs, i) -> new EnvelopeItem(
                    UUID.fromString(rs.getString("id")),
                    rs.getString("name"),
                    rs.getLong("balance_minor"),
                    rs.getString("category_id") == null ? null : UUID.fromString(rs.getString("category_id"))),
                scope.tenantId(), p);

            Map<String, Long> pseudo = jdbc.query(
                "SELECT kind::text AS kind, balance_minor FROM envelopes WHERE tenant_id = ? AND kind <> 'user'",
                rs -> {
                    java.util.HashMap<String, Long> m = new java.util.HashMap<>();
                    while (rs.next()) {
                        m.put(rs.getString("kind"), rs.getLong("balance_minor"));
                    }
                    return m;
                },
                scope.tenantId());

            java.util.HashMap<String, Object> body = new java.util.HashMap<>();
            body.put("period", p);
            body.put("envelopes", envelopes);
            body.put("unallocatedMinor", pseudo.getOrDefault("unallocated", 0L));
            body.put("incomeMinor", pseudo.getOrDefault("income", 0L));
            body.put("spentMinor", pseudo.getOrDefault("spent", 0L));
            return body;
        });
    }

    @PostMapping(
        value = "/api/v0/budget/envelopes",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> createEnvelope(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody CreateEnvelopeRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "envelope:write");
        if (req.name() == null || req.name().isBlank()) {
            throw new ApiException.BadRequest("name is required");
        }
        String period = (req.period() == null || req.period().isBlank()) ? currentPeriod() : req.period().trim();
        if (!period.matches("\\d{4}-\\d{2}")) {
            throw new ApiException.BadRequest("period must be yyyy-MM");
        }

        UUID envelopeId = ledger.ensureUserEnvelope(scope.tenantId(), req.name().trim(), period);

        if (req.categoryId() != null) {
            // Anchor the envelope to its category (V6) so the M11→M12 bridge
            // routes categorized spends here.
            tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
                jdbc.update(
                    "UPDATE envelopes SET category_id = ? WHERE id = ? AND tenant_id = ?",
                    req.categoryId(), envelopeId, scope.tenantId());
            });
        }
        return Map.of("envelopeId", envelopeId);
    }

    @PostMapping(
        value = "/api/v0/budget/income",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> income(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody IncomeRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "envelope:write");
        long amount = requireAmount(req.amountMinor());

        UUID income = ledger.ensurePseudoEnvelope(scope.tenantId(), EnvelopeKind.income);
        UUID unallocated = ledger.ensurePseudoEnvelope(scope.tenantId(), EnvelopeKind.unallocated);
        UUID transferId = ledger.allocate(
            scope.tenantId(), income, unallocated, amount,
            (req.description() == null || req.description().isBlank()) ? "income" : req.description().trim());
        return Map.of("transferId", transferId);
    }

    @PostMapping(
        value = "/api/v0/budget/allocate",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> allocate(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody AllocateRequest req
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "envelope:write");
        long amount = requireAmount(req.amountMinor());
        if (req.toEnvelopeId() == null) {
            throw new ApiException.BadRequest("toEnvelopeId is required");
        }

        UUID from = (req.fromEnvelopeId() != null)
            ? req.fromEnvelopeId()
            : ledger.ensurePseudoEnvelope(scope.tenantId(), EnvelopeKind.unallocated);
        UUID transferId = ledger.allocate(
            scope.tenantId(), from, req.toEnvelopeId(), amount,
            (req.description() == null || req.description().isBlank()) ? "allocate" : req.description().trim());
        return Map.of("transferId", transferId);
    }

    private static long requireAmount(Long amountMinor) {
        if (amountMinor == null || amountMinor <= 0) {
            throw new ApiException.BadRequest("amountMinor must be a positive integer (paise)");
        }
        return amountMinor;
    }

    private static String currentPeriod() {
        LocalDate now = LocalDate.now();
        return String.format("%04d-%02d", now.getYear(), now.getMonthValue());
    }
}
