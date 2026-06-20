package com.ledgerline.contracts;

import java.util.Objects;

/**
 * Money is an integer count of minor units (paise for INR).
 *
 * <p>Java mirror of the TS {@code Money} value type (packages/types/src/money.ts).
 * We never represent money as a floating-point number: {@code 0.1 + 0.2 != 0.3},
 * and rounding drift in a ledger is unacceptable. The amount is held as a
 * primitive {@code long} (minor units) and all arithmetic is integer arithmetic.
 *
 * <p>Why {@code long}, not {@code double}/{@code BigDecimal}: a long gives
 * +-9.2e18 paise of headroom — no realistic ledger overflows it — and matches
 * the {@code BIGINT *_minor} columns in the M5 schema field-for-field. (The
 * brief allows {@code BigInteger}; {@code long} is the right call here because
 * the DB column is BIGINT and long maps to it without boxing or conversion.)
 *
 * <p>{@code minor} MAY be negative — ledger deltas are signed.
 */
public record Money(long minor, CurrencyCode currency) {

    public Money {
        Objects.requireNonNull(currency, "currency");
    }

    /** The canonical zero, mirroring TS {@code ZERO_INR}. */
    public static final Money ZERO_INR = new Money(0L, CurrencyCode.INR);

    /** Construct INR Money from an integer minor-unit (paise) amount. */
    public static Money ofMinor(long minor) {
        return new Money(minor, CurrencyCode.INR);
    }

    public static Money ofMinor(long minor, CurrencyCode currency) {
        return new Money(minor, currency);
    }

    /**
     * Construct Money from a rupee figure, e.g. 149.5 -> 14950 paise. Mirrors TS
     * {@code fromRupees}. Uses {@link Math#round} on rupees*100 — callers that
     * already have exact paise should prefer {@link #ofMinor}.
     */
    public static Money fromRupees(double rupees) {
        return fromRupees(rupees, CurrencyCode.INR);
    }

    public static Money fromRupees(double rupees, CurrencyCode currency) {
        return new Money(Math.round(rupees * 100.0), currency);
    }

    private void assertSameCurrency(Money other) {
        if (this.currency != other.currency) {
            throw new IllegalArgumentException(
                "Currency mismatch: " + this.currency + " vs " + other.currency);
        }
    }

    public Money add(Money other) {
        assertSameCurrency(other);
        return new Money(Math.addExact(this.minor, other.minor), this.currency);
    }

    public Money subtract(Money other) {
        assertSameCurrency(other);
        return new Money(Math.subtractExact(this.minor, other.minor), this.currency);
    }

    public Money negate() {
        return new Money(Math.negateExact(this.minor), this.currency);
    }

    public boolean isNegative() {
        return this.minor < 0;
    }

    public boolean isZero() {
        return this.minor == 0;
    }

    /**
     * Human-readable format with Indian digit grouping, e.g. 149500 paise ->
     * "INR 1,495.00". Mirrors TS {@code formatMoney}; we use an ASCII "INR "
     * prefix rather than the rupee glyph to keep this dependency-free and
     * encoding-safe across consoles.
     */
    public String format() {
        String sign = this.minor < 0 ? "-" : "";
        long abs = Math.abs(this.minor);
        long whole = abs / 100;
        String frac = String.format("%02d", abs % 100);
        String prefix = this.currency == CurrencyCode.INR ? "INR " : "";
        return sign + prefix + groupIndian(whole) + "." + frac;
    }

    /** Indian digit grouping: ...,XX,XX,XXX (last group of 3, then groups of 2). */
    private static String groupIndian(long value) {
        String s = Long.toString(value);
        if (s.length() <= 3) {
            return s;
        }
        String last3 = s.substring(s.length() - 3);
        String rest = s.substring(0, s.length() - 3);
        StringBuilder grouped = new StringBuilder();
        int count = 0;
        for (int i = rest.length() - 1; i >= 0; i--) {
            grouped.append(rest.charAt(i));
            if (++count % 2 == 0 && i != 0) {
                grouped.append(',');
            }
        }
        return grouped.reverse() + "," + last3;
    }
}
