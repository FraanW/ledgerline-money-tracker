package com.ledgerline.ingestion;

import java.util.List;
import java.util.Map;

/**
 * M3 seam — resolve raw statement descriptions to canonical merchant names
 * ("UPI/SWIGGY/220011" → "Swiggy").
 *
 * <p>Contract: returns a map of {@code rawDescription → canonical merchant}
 * containing ONLY confident matches. An absent key means the canonicalizer
 * ABSTAINED (precision-first, ADR-0008) — the transaction keeps a NULL
 * merchant rather than a guessed one. Implementations MUST fail open: a
 * down/slow canonicalizer returns an empty map and never breaks ingestion.
 */
@FunctionalInterface
public interface MerchantCanonicalizer {

    /** Best-effort batch canonicalization; never throws. */
    Map<String, String> canonicalizeBatch(List<String> rawDescriptions);
}
