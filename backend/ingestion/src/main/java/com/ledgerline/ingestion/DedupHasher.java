package com.ledgerline.ingestion;

import com.ledgerline.contracts.TransactionDirection;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.UUID;

/**
 * The idempotency key for an ingested transaction.
 *
 * <h2>The hash</h2>
 * {@code dedup_hash = sha256_hex(accountId | postedAt(ISO yyyy-MM-dd) |
 *                                amount.minor | direction.lowercase |
 *                                rawDescription)}
 *
 * <p>Joined with the ASCII {@code |} character — a literal byte that cannot
 * appear in a UUID, an ISO date, a decimal long, or {@code "debit"} /
 * {@code "credit"}; the only field that could contain it is
 * {@code rawDescription}. Since {@code rawDescription} is the LAST field, a
 * pipe inside the description cannot collide with a different prefix-shape
 * (the field boundary is unambiguous because the prefix fields all have
 * fixed grammar). This is the same property a length-prefixed encoding would
 * give but cheaper and easier to read.
 *
 * <h2>Why these five fields and no others</h2>
 * The dedup hash is the answer to "is this row the same physical bank line we
 * already ingested?". The five fields are exactly the ones a bank fixes about
 * a transaction: the account, the date the bank posted it, the amount, the
 * direction, and the verbatim description. {@code tenantId} is NOT part of
 * the hash — the schema's UNIQUE constraint is
 * {@code (tenant_id, dedup_hash)} so the tenant already scopes uniqueness,
 * and including it here would prevent us from later detecting (e.g. for
 * support tooling) when two tenants happen to share a bank-line fingerprint.
 *
 * <h2>Determinism</h2>
 * The same input bytes always produce the same 64-char lowercase hex output.
 * That is the contract the UNIQUE-constraint-based idempotency relies on:
 * re-uploading the same statement produces identical hashes, the DB ON
 * CONFLICT drops the row, the user sees a duplicate count instead of a
 * double-counted transaction.
 *
 * <h2>Why SHA-256 (not MD5, not a UUIDv5)</h2>
 * MD5's collision profile is well past "no thanks" for a key the DB indexes.
 * SHA-256 gives a 64-char hex string that fits the {@code TEXT} column with
 * no encoding fuss, is fast enough that one upload's worth of rows is
 * negligible, and is the standard "I have no key, hash these fields" choice.
 * A UUIDv5 would do the same job but encodes the hash as a UUID, which is
 * the wrong shape for a content-derived idempotency key.
 */
public final class DedupHasher {

    private static final char SEP = '|';

    private DedupHasher() {}

    /**
     * Compute the deterministic SHA-256 hex of the canonical field tuple.
     * Returns a 64-char lowercase hex string suitable for the
     * {@code transactions.dedup_hash TEXT NOT NULL} column.
     */
    public static String hash(
        UUID accountId,
        LocalDate postedAt,
        long amountMinor,
        TransactionDirection direction,
        String rawDescription
    ) {
        StringBuilder sb = new StringBuilder(160);
        sb.append(accountId.toString());          // canonical lowercased UUID
        sb.append(SEP);
        sb.append(postedAt.toString());           // ISO yyyy-MM-dd by default
        sb.append(SEP);
        sb.append(amountMinor);                   // decimal long, exact paise
        sb.append(SEP);
        sb.append(direction.name());              // "debit" or "credit" (matches enum)
        sb.append(SEP);
        sb.append(rawDescription);                // verbatim, last so pipes are safe

        byte[] bytes = sb.toString().getBytes(StandardCharsets.UTF_8);
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK spec; this branch is unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
        byte[] out = digest.digest(bytes);
        return toHex(out);
    }

    private static String toHex(byte[] bytes) {
        char[] hex = new char[bytes.length * 2];
        for (int i = 0; i < bytes.length; i++) {
            int b = bytes[i] & 0xFF;
            hex[i * 2]     = HEX[b >>> 4];
            hex[i * 2 + 1] = HEX[b & 0x0F];
        }
        return new String(hex);
    }

    private static final char[] HEX = "0123456789abcdef".toCharArray();
}
