"""Ledgerline M3 — merchant canonicalization service.

Turns a noisy bank/UPI/card transaction string into a clean canonical merchant
(+ category hint) through a precision-first hybrid pipeline:

    normalize (deterministic floor) -> rule/alias match -> embedding NN (MiniLM
    over pgvector) -> confidence gate -> [accept | $-capped LLM fallback | ABSTAIN].

The deterministic floor runs first and carries most of the load (cheap,
explainable). Embeddings recover the noisy tail; the LLM only adjudicates the
genuinely ambiguous middle. When nothing is confident, the pipeline ABSTAINS
(returns UNKNOWN) rather than risk a wrong label.
"""

__version__ = "0.1.0"
