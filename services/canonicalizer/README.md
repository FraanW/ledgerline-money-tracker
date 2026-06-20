# Canonicalizer (M3) — merchant canonicalization

Turns a noisy Indian bank/UPI/card transaction string into a **clean canonical
merchant** (+ category hint). It is the stage between ingestion (M1) and
categorization (M11): a good merchant name makes every downstream rule, lens,
and nudge sharper.

```
  "UPI/BLINKIT/blinkcommerce.rzp@axisb/Payment"   ->   Blinkit   (Groceries)
  "AMZ*MKTP IN 4QX5RT12"                          ->   Amazon    (Ecommerce)
  "UPI/SHARMA KIRANA STORE/sharma123@oksbi"       ->   UNKNOWN   (abstain)
```

## Design — hybrid, precision-first

```
 normalize ─▶ rule floor ─▶ embedding NN ─▶ confidence gate ─▶ [LangGraph LLM | ABSTAIN]
 (strip rails,  (alias/token   (MiniLM over    (>=accept: take;   (ambiguous middle:
  VPA, refs)     match, the     pgvector,       <floor: abstain)   adjudicate, capped)
                 cheap floor)   cosine NN)
```

1. **Normalize** — strip rail prefixes (UPI/POS/NEFT/ACH), VPA handles, gateway
   hops, legal-entity tails, city codes and ref/pincode digit runs; mine brand
   signal out of the VPA local part. Conservative: never strips a word that's
   part of a brand.
2. **Rule floor** (deterministic, cheap, explainable) — a unique, specific
   alias/token match auto-accepts. Generic words (COIN/MORE/STAR/TATA/RELIANCE/
   PRIME/CITY) are barred from auto-accepting — the classic false-positive traps.
3. **Embedding NN** — nearest merchant by cosine over a multi-vector index
   (one vector per surface form). Auto-accepts above `accept_threshold` **only
   if a non-ambiguous token corroborates it** (precision guard).
4. **LangGraph LLM fallback** — the ambiguous middle (`[llm_floor, accept)`) is
   adjudicated by a small LangGraph `StateGraph` (budget-gate → resolve →
   validate), constrained to the candidate set and capped by a hard `$` spend
   gate. It can never invent a merchant.
5. **Abstain** — when nothing is confident, return `UNKNOWN`. **A wrong label is
   worse than no label.** A small denylist also forces abstain on known-confusable
   strings (e.g. "UBER EATS", defunct in India).

The deterministic floor carries the load (cheap + auditable); embeddings recover
the noisy tail; the LLM only touches the genuinely ambiguous few.

## Results (eval over 126 labeled rows)

Default config — **hashing embedder, LLM disabled** (no model download, no API):

| metric | value |
|---|---|
| known accuracy | **94.3%** (100/106) |
| abstain recall (UNKNOWN) | **100%** (20/20) |
| **false accepts on UNKNOWN** | **0** (the dangerous error) |
| accept precision | **99.0%** |
| coverage | 80.2% |

Turning on MiniLM (`CANON_USE_REAL_MODEL=true`) + the LangGraph LLM recovers more
of the abstained tail (semantic matches + adjudication) at the same precision.

## Categorization (M11 v1) — composed on top of M3

`POST /categorize` assigns a spending category. It reuses M3 wholesale:

```
1. merchant -> category   (M3 resolved the merchant -> its category; ~free, highest precision)
2. keyword rules          (FUEL->Fuel, RENT->Rent, KIRANA->Groceries, SALON->Personal Care ...)
3. embedding kNN vote      (vote categories of M3's nearest merchants, weighted by similarity;
                            accept only when confident — floor at parity with canonicalization)
4. LangGraph LLM           (pick ONE category from the fixed taxonomy, capped, can't invent one)
5. Uncategorized           (abstain over guess)
```

Eval (`eval/run_category_eval.py`, 36 labeled rows, hashing + LLM off):

| metric | value |
|---|---|
| category accuracy | **100%** (30/30) |
| uncategorized recall | **100%** (6/6) |
| false categorizations | **0** |

The merchant + keyword floors are the deterministic guarantees; kNN and the LLM
add recall on the unknown-merchant tail (unit-tested with stubs/fakes). One
shared `$` spend gate spans both the merchant and category LLMs.

## Recurring & anomaly detection — `POST /recurring`

Statistical, interpretable detection over a transaction history (no heavy deps).
Groups by canonical merchant (reusing M3), then per series:

- **recurring?** regular cadence (weekly…yearly bands) + stable amount → a
  `RecurringSeries` with cadence, representative amount, annualized cost, next
  expected date, confidence.
- **anomalies**: `trial_to_paid` (free-trap), `price_hike`, `amount_spike`,
  `new_recurring`, `lapsed`.

This is the backend that makes the **Subscription Leak / Latte Factor / Free-Trap
/ Pain Restorer** lenses live. Eval (`eval/run_recurring_eval.py`, 6-month
labeled history): recurring **P/R/F1 = 100%**, anomalies **100% recall, 0
false-positives**.

## Run

```bash
py -3.11 -m venv .venv && . .venv/Scripts/activate     # (Linux: source .venv/bin/activate)
pip install -r requirements.txt                         # base (hashing embedder, LLM off)
uvicorn canonicalizer.api:app --reload                  # http://localhost:8000

# opt into capability:
pip install -r requirements-ml.txt     # real MiniLM embeddings   -> CANON_USE_REAL_MODEL=true
pip install -r requirements-llm.txt    # LangGraph LLM fallback    -> CANON_LLM_ENABLED=true + key
```

### HTTP

```
GET  /healthz
POST /canonicalize         {"raw": "...", "merchant_hint": "..."}
POST /canonicalize/batch   {"items": [{"raw": "..."}]}
POST /admin/reindex
```
Response: `{ canonical, category, confidence, method, candidates[] }` where
`method ∈ {rule, embedding, llm, abstain}` (fully explainable).

## Test & evaluate

```bash
pip install -r requirements.txt langgraph langchain-core pytest
pytest                            # 39 tests — pipeline, normalize, store, spend, categorize, recurring, LangGraph (offline)
python eval/run_eval.py           # M3 canonicalization metrics + guardrail
python eval/run_category_eval.py  # M11 categorization metrics + guardrail
python eval/run_recurring_eval.py # recurring + anomaly metrics + guardrail
```

`eval/run_eval.py` is the CI gate: it fails if known-accuracy, abstain-recall,
or the false-accept count regress.

## Configuration

All env-driven (`CANON_*`, see `.env.example`). Key knobs: `USE_REAL_MODEL`,
`ACCEPT_THRESHOLD`, `LLM_FLOOR`, `LLM_ENABLED` + `OPENROUTER_API_KEY`,
`LLM_SPEND_CAP_USD`, `DATABASE_URL` (pgvector; apply `schema.sql` then
`/admin/reindex`).

## Production notes

- **Store**: set `CANON_DATABASE_URL` to use the pgvector store (`schema.sql`);
  the in-memory store is the default for dev/CI.
- **Spend gate**: the `$` cap is in-process; persist it to Redis/DB for a
  multi-process cap.
- **Orchestration**: the online path is framework-free Python; the LLM step is
  LangGraph; cross-service wiring (ingest → canonicalize → categorize) rides the
  event bus (M4) once it lands.
