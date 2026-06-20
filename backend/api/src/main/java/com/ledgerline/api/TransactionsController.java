package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The transactions feed — what the dashboard, the Transactions surface, and
 * the Log inbox read.
 *
 * <pre>
 * GET /api/v0/transactions?from=2026-06-01&amp;to=2026-06-30&amp;categoryId=…&amp;q=swiggy&amp;limit=50&amp;offset=0
 *   → { items: [Transaction…], total }     (permission: transaction:read)
 * </pre>
 *
 * Item shape mirrors {@code @ledgerline/types} Transaction (paise Money,
 * nullable merchant/categoryId) plus the Sweep-1 back-links
 * ({@code statementId}, {@code recurringSeriesId}).
 */
@RestController
public class TransactionsController {

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public TransactionsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record TxnItem(
        UUID id,
        UUID accountId,
        String postedAt,
        Map<String, Object> amount,
        String direction,
        String rawDescription,
        String merchant,
        UUID categoryId,
        String source,
        String ingestedAt,
        UUID statementId,
        UUID recurringSeriesId
    ) {}

    @GetMapping(value = "/api/v0/transactions", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> list(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestParam(required = false) String from,
        @RequestParam(required = false) String to,
        @RequestParam(required = false) String categoryId,
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Integer limit,
        @RequestParam(required = false) Integer offset
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "transaction:read");

        LocalDate fromDate = parseDate(from, "from");
        LocalDate toDate = parseDate(to, "to");
        UUID category = parseUuid(categoryId, "categoryId");
        int lim = (limit == null) ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
        int off = (offset == null) ? 0 : Math.max(offset, 0);

        // Explicit tenant predicate — defense-in-depth on top of RLS, and the
        // correctness floor when a privileged (RLS-bypassing) connection is
        // misconfigured as the runtime pool.
        StringBuilder where = new StringBuilder(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(scope.tenantId());
        if (fromDate != null) {
            where.append(" AND posted_at >= ?");
            params.add(fromDate);
        }
        if (toDate != null) {
            where.append(" AND posted_at <= ?");
            params.add(toDate);
        }
        if (category != null) {
            where.append(" AND category_id = ?");
            params.add(category);
        }
        if (q != null && !q.isBlank()) {
            where.append(" AND (raw_description ILIKE ? OR merchant ILIKE ?)");
            String like = "%" + q.trim() + "%";
            params.add(like);
            params.add(like);
        }

        return tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM transactions" + where, Integer.class, params.toArray());

            List<Object> pageParams = new ArrayList<>(params);
            pageParams.add(lim);
            pageParams.add(off);
            List<TxnItem> items = jdbc.query(
                """
                SELECT id, account_id, posted_at, amount_minor, currency::text AS currency,
                       direction::text AS direction, raw_description, merchant, category_id,
                       source::text AS source, ingested_at, statement_id, recurring_series_id
                FROM transactions
                """ + where + " ORDER BY posted_at DESC, ingested_at DESC LIMIT ? OFFSET ?",
                (rs, i) -> new TxnItem(
                    UUID.fromString(rs.getString("id")),
                    UUID.fromString(rs.getString("account_id")),
                    rs.getDate("posted_at").toLocalDate().toString(),
                    Map.of("minor", rs.getLong("amount_minor"), "currency", rs.getString("currency")),
                    rs.getString("direction"),
                    rs.getString("raw_description"),
                    rs.getString("merchant"),
                    optUuid(rs.getString("category_id")),
                    rs.getString("source"),
                    rs.getTimestamp("ingested_at").toInstant().toString(),
                    optUuid(rs.getString("statement_id")),
                    optUuid(rs.getString("recurring_series_id"))),
                pageParams.toArray());

            return Map.of("items", items, "total", total);
        });
    }

    private static UUID optUuid(String s) {
        return s == null ? null : UUID.fromString(s);
    }

    private static LocalDate parseDate(String value, String name) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (DateTimeParseException bad) {
            throw new ApiException.BadRequest(name + " must be an ISO date (yyyy-MM-dd)");
        }
    }

    private static UUID parseUuid(String value, String name) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.trim());
        } catch (IllegalArgumentException bad) {
            throw new ApiException.BadRequest(name + " is not a valid UUID");
        }
    }
}
