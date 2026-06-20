package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import com.ledgerline.contracts.TransactionDirection;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pure-Java dedup-hash invariants — no DB.
 *
 * <p>The hash is the idempotency key the DB UNIQUE constraint
 * {@code (tenant_id, dedup_hash)} indexes on. Two properties matter:
 * <ol>
 *   <li><b>Deterministic.</b> Same inputs → same 64-char lowercase hex.</li>
 *   <li><b>Field-sensitive.</b> Changing any of the five input fields produces
 *       a different hash. Without this property the DB would silently treat
 *       distinct bank lines as duplicates.</li>
 * </ol>
 */
class DedupHasherTest {

    private static final UUID ACCT = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final LocalDate DATE = LocalDate.of(2026, 5, 1);

    @Test
    @DisplayName("hash is deterministic — same inputs produce the same hex")
    void hash_is_deterministic() {
        String h1 = DedupHasher.hash(ACCT, DATE, 149_950L, TransactionDirection.debit, "UPI/BIGBAZAAR/123");
        String h2 = DedupHasher.hash(ACCT, DATE, 149_950L, TransactionDirection.debit, "UPI/BIGBAZAAR/123");
        assertThat(h1).isEqualTo(h2);
    }

    @Test
    @DisplayName("hash is 64 lowercase hex chars (the SHA-256 hex shape)")
    void hash_has_canonical_sha256_hex_shape() {
        String h = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "x");
        assertThat(h).hasSize(64);
        assertThat(h).matches("^[0-9a-f]{64}$");
    }

    @Test
    @DisplayName("changing the accountId changes the hash")
    void accountId_affects_hash() {
        UUID other = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        String h1 = DedupHasher.hash(ACCT,  DATE, 100L, TransactionDirection.debit, "x");
        String h2 = DedupHasher.hash(other, DATE, 100L, TransactionDirection.debit, "x");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    @DisplayName("changing the postedAt changes the hash")
    void postedAt_affects_hash() {
        String h1 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "x");
        String h2 = DedupHasher.hash(ACCT, DATE.plusDays(1), 100L, TransactionDirection.debit, "x");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    @DisplayName("changing the amount changes the hash")
    void amount_affects_hash() {
        String h1 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "x");
        String h2 = DedupHasher.hash(ACCT, DATE, 101L, TransactionDirection.debit, "x");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    @DisplayName("changing the direction changes the hash (debit vs credit are distinct)")
    void direction_affects_hash() {
        String h1 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit,  "x");
        String h2 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.credit, "x");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    @DisplayName("changing the rawDescription changes the hash")
    void description_affects_hash() {
        String h1 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "UPI/BIGBAZAAR/123");
        String h2 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "UPI/BIGBAZAAR/124");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    @DisplayName("a literal '|' inside rawDescription is safe (description is the last field)")
    void pipe_inside_description_does_not_collide_with_prefix_shift() {
        // If we had not placed rawDescription last, a description containing "|"
        // could shift fields around and collide with a different prefix shape.
        // The contract is: rawDescription is LAST, so its content is unambiguous.
        String h1 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "PIPE|HERE");
        String h2 = DedupHasher.hash(ACCT, DATE, 100L, TransactionDirection.debit, "PIPEHERE");
        assertThat(h1).isNotEqualTo(h2);
    }
}
