package com.ledgerline.categorizer;

import com.ledgerline.platform.db.TenantContext;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * M11 — the rules-based categoriser.
 *
 * <p>v0 is deterministic only: a per-tenant list of patterns the user (or a
 * future correction UI) attaches to categories. The categoriser evaluates them
 * in priority order against {@code (rawDescription, merchant)} and returns the
 * first match. v1 will layer an LLM fallback in front of (or behind) this same
 * interface — but the v0 deterministic floor must always be the first call,
 * because rules are cheap, explainable, and learnable.
 *
 * <h2>The rule-evaluation algorithm</h2>
 * <ol>
 *   <li>Inside the tenant's RLS context, SELECT all {@code enabled=true} rules
 *       ordered by {@code priority ASC} (lower number wins).</li>
 *   <li>For each rule, in order, evaluate the pattern against
 *       {@code rawDescription} AND {@code merchant} (both, when present).
 *       The match function is case-insensitive for every kind.</li>
 *   <li>Return the first rule's {@code category_id}; or empty if nothing matches.</li>
 * </ol>
 *
 * <h2>Defensive regex handling</h2>
 * A user-attached {@code regex} rule with a malformed pattern (or a pattern
 * that throws at compile time) must NOT abort the whole evaluation — other
 * rules should still get their turn. The behaviour is: log a warning once
 * per evaluation and skip that rule. (We do not disable the rule in the DB:
 * the bridge is not the right place to mutate user-owned data, and the same
 * rule might be edited and become valid; a future "rule lint" surface in the
 * correction UI is the right home for that.)
 *
 * <h2>Why no caching</h2>
 * v0 reads the rules fresh per match call. The hot lookup is indexed
 * ({@code idx_categorization_rules_eval} on
 * {@code (tenant_id, enabled, priority)}) and the rule set per tenant is
 * small (tens of rows). A cache would only complicate invalidation when the
 * correction UI starts mutating rules; we revisit if the per-call cost shows
 * up under load.
 */
@Service
public class CategorizerService {

    private static final Logger log = LoggerFactory.getLogger(CategorizerService.class);

    private final TenantContext tenantContext;

    public CategorizerService(TenantContext tenantContext) {
        this.tenantContext = tenantContext;
    }

    /**
     * Return the matching category id for the given transaction text, evaluating
     * rules in priority order. The lookup runs inside a {@link TenantContext}
     * transaction so RLS scopes the visible rule set.
     *
     * @param tenantId        the tenant whose rules to evaluate
     * @param rawDescription  the bank's raw row description (never null in the
     *                        ingestion path, but tolerated as null/blank here)
     * @param merchant        the canonicalised merchant (M3 — nullable in v0)
     * @return the first matching rule's {@code category_id}, or empty
     */
    public Optional<UUID> match(UUID tenantId, String rawDescription, String merchant) {
        List<RuleRow> rules = tenantContext.withTenant(tenantId, (JdbcTemplate jdbc) ->
            jdbc.query(
                """
                SELECT id, pattern_kind::text AS pattern_kind, pattern, category_id, priority
                FROM categorization_rules
                WHERE enabled = true
                ORDER BY priority ASC, id ASC
                """,
                (rs, rowNum) -> new RuleRow(
                    UUID.fromString(rs.getString("id")),
                    rs.getString("pattern_kind"),
                    rs.getString("pattern"),
                    UUID.fromString(rs.getString("category_id")),
                    rs.getInt("priority"))));

        for (RuleRow rule : rules) {
            if (matchesRule(rule, rawDescription, merchant)) {
                return Optional.of(rule.categoryId());
            }
        }
        return Optional.empty();
    }

    /**
     * Apply one rule's pattern to the available text fields. A rule matches if
     * its pattern is satisfied by EITHER {@code rawDescription} OR {@code merchant}
     * (when present). Case-insensitive in every pattern kind.
     *
     * <p>Returns {@code false} (rather than throwing) for a bad regex: the
     * single-rule defensive case explicitly required by the M11 spec.
     */
    private static boolean matchesRule(RuleRow rule, String rawDescription, String merchant) {
        return switch (rule.patternKind()) {
            case "contains" -> containsCi(rawDescription, rule.pattern())
                            || containsCi(merchant, rule.pattern());
            case "equals"   -> equalsCi(rawDescription, rule.pattern())
                            || equalsCi(merchant, rule.pattern());
            case "regex"    -> regexMatch(rule, rawDescription, merchant);
            default -> {
                // An unknown kind would mean the DB enum drifted from this code
                // — log it and treat as "no match" rather than throw, so other
                // rules still evaluate.
                log.warn("categorizer: unknown pattern_kind={} rule={}, skipping",
                    rule.patternKind(), rule.id());
                yield false;
            }
        };
    }

    /** Per-rule wall-clock budget for a regex match — bounds catastrophic backtracking. */
    private static final long REGEX_BUDGET_NANOS = 100_000_000L; // 100ms

    private static boolean regexMatch(RuleRow rule, String rawDescription, String merchant) {
        Pattern compiled;
        try {
            compiled = Pattern.compile(rule.pattern(), Pattern.CASE_INSENSITIVE);
        } catch (PatternSyntaxException badRegex) {
            // Defensive: a malformed user-attached regex MUST NOT poison the
            // whole evaluation. Log once at warn and skip just this rule.
            log.warn("categorizer: invalid regex in rule={} pattern={}: {}; skipping",
                rule.id(), rule.pattern(), badRegex.getDescription());
            return false;
        }
        return timedFind(compiled, rawDescription, rule) || timedFind(compiled, merchant, rule);
    }

    /**
     * Run {@code pattern.find()} under a wall-clock budget. A user-supplied
     * categorization rule is attacker-controlled (only {@code rule:write}), and
     * a catastrophic-backtracking pattern (e.g. {@code (a+)+$}) against a
     * crafted statement row would pin the ingestion thread indefinitely
     * (ReDoS — Tasha finding #4). We feed the input through a
     * {@link DeadlineCharSequence} whose {@code charAt} aborts once the budget
     * is exhausted; a timeout is treated as "no match" + logged, never a hang.
     */
    private static boolean timedFind(Pattern pattern, String input, RuleRow rule) {
        if (input == null) {
            return false;
        }
        try {
            return pattern.matcher(
                new DeadlineCharSequence(input, System.nanoTime() + REGEX_BUDGET_NANOS)).find();
        } catch (RegexBudgetExceeded timeout) {
            log.warn("categorizer: regex rule={} exceeded {}ms on input — skipping (possible ReDoS pattern)",
                rule.id(), REGEX_BUDGET_NANOS / 1_000_000L);
            return false;
        }
    }

    /** Raised by {@link DeadlineCharSequence} when a regex match overruns its budget. */
    private static final class RegexBudgetExceeded extends RuntimeException {
        RegexBudgetExceeded() {
            super(null, null, false, false); // no message/stacktrace — it's control flow
        }
    }

    /**
     * A read-only CharSequence view that throws {@link RegexBudgetExceeded}
     * once {@code deadlineNanos} passes. The regex engine calls {@code charAt}
     * on every backtracking step, so checking the clock there (every 1024
     * reads, to keep it cheap) bounds even pathological patterns by time.
     */
    private static final class DeadlineCharSequence implements CharSequence {
        private final CharSequence delegate;
        private final long deadlineNanos;
        private int reads;

        DeadlineCharSequence(CharSequence delegate, long deadlineNanos) {
            this.delegate = delegate;
            this.deadlineNanos = deadlineNanos;
        }

        @Override
        public char charAt(int index) {
            if ((++reads & 0x3FF) == 0 && System.nanoTime() > deadlineNanos) {
                throw new RegexBudgetExceeded();
            }
            return delegate.charAt(index);
        }

        @Override public int length() { return delegate.length(); }

        @Override public CharSequence subSequence(int start, int end) {
            return new DeadlineCharSequence(delegate.subSequence(start, end), deadlineNanos);
        }

        @Override public String toString() { return delegate.toString(); }
    }

    private static boolean containsCi(String haystack, String needle) {
        if (haystack == null || needle == null || needle.isEmpty()) {
            return false;
        }
        // toLowerCase(Locale.ROOT) on both sides is the predictable
        // case-insensitive substring match; we don't need full ICU folding here.
        return haystack.toLowerCase(java.util.Locale.ROOT)
            .contains(needle.toLowerCase(java.util.Locale.ROOT));
    }

    private static boolean equalsCi(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        return left.equalsIgnoreCase(right);
    }

    /** A compact projection of one row from {@code categorization_rules}. */
    private record RuleRow(UUID id, String patternKind, String pattern, UUID categoryId, int priority) {}
}
