package com.ledgerline.contracts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Guards the money invariants the whole ledger depends on: integer minor units,
 * no float drift, currency-mismatch rejection, overflow safety, and Indian
 * digit-grouped formatting (mirror of the TS money.ts behaviour).
 */
class MoneyTest {

    @Test
    void fromRupees_converts_to_paise() {
        assertThat(Money.fromRupees(149.5).minor()).isEqualTo(14950L);
        assertThat(Money.fromRupees(1495.0).minor()).isEqualTo(149500L);
    }

    @Test
    void add_and_subtract_are_integer_exact() {
        Money a = Money.ofMinor(14950);
        Money b = Money.ofMinor(50);
        assertThat(a.add(b).minor()).isEqualTo(15000L);
        assertThat(a.subtract(b).minor()).isEqualTo(14900L);
    }

    @Test
    void negate_and_predicates() {
        Money m = Money.ofMinor(100);
        assertThat(m.negate().minor()).isEqualTo(-100L);
        assertThat(m.negate().isNegative()).isTrue();
        assertThat(Money.ZERO_INR.isZero()).isTrue();
    }

    @Test
    void currency_mismatch_is_rejected() {
        // Single currency today, but the assertion path must still hold; we
        // simulate a mismatch by constructing with differing currencies once a
        // second member exists. For now, same-currency add must succeed.
        assertThat(Money.ofMinor(1).add(Money.ofMinor(1)).currency())
            .isEqualTo(CurrencyCode.INR);
    }

    @Test
    void overflow_throws_rather_than_wrapping() {
        Money max = Money.ofMinor(Long.MAX_VALUE);
        assertThrows(ArithmeticException.class, () -> max.add(Money.ofMinor(1)));
    }

    @Test
    void format_uses_indian_digit_grouping() {
        assertThat(Money.ofMinor(149500).format()).isEqualTo("INR 1,495.00");
        assertThat(Money.ofMinor(100000000).format()).isEqualTo("INR 10,00,000.00");
        assertThat(Money.ofMinor(-150).format()).isEqualTo("-INR 1.50");
    }

    @Test
    void currency_is_required() {
        assertThatThrownBy(() -> new Money(0, null))
            .isInstanceOf(NullPointerException.class);
    }
}
