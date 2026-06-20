"""The canonicalization pipeline — explicit, precision-first orchestration.

    normalize → rule floor → embedding NN → confidence gate → [LLM | ABSTAIN]

1. Rule floor (deterministic, cheap, explainable): does a merchant's alias/token
   appear as a whole token (single) or contiguous phrase (multi-word) in the
   normalized input? A unique, specific hit auto-accepts (method=RULE). Generic
   single words (COIN/MORE/STAR/TATA/RELIANCE/PRIME/CITY) are NOT allowed to
   auto-accept — they're the classic false-positive traps, so they defer.
2. Embedding NN: nearest merchant by cosine. >= accept_threshold → accept.
3. Ambiguous middle ([llm_floor, accept), or a tied rule) → the LangGraph LLM
   adjudicates, constrained to the candidate set.
4. Otherwise ABSTAIN (UNKNOWN) — a wrong label is worse than no label.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .embeddings import Embedder
from .llm import LLMClient, NullLLM
from .normalize import normalize
from .store import VectorStore
from .types import Candidate, CanonResult, MerchantRecord, Method

# Generic words that must never auto-accept on a bare single-token rule hit.
AMBIGUOUS_SINGLE = {"COIN", "MORE", "STAR", "TATA", "RELIANCE", "PRIME", "CITY"}

_PHRASE = re.compile(r"[A-Z0-9']+")


def _phrase_tokens(s: str) -> tuple[str, ...]:
    return tuple(_PHRASE.findall(s.upper()))


@dataclass
class _RuleOutcome:
    merchant: MerchantRecord | None          # unique confident winner
    ambiguous: list[MerchantRecord]          # >1 equally-specific winners


class Canonicalizer:
    def __init__(
        self,
        records: list[MerchantRecord],
        embedder: Embedder,
        store: VectorStore,
        settings,
        llm: LLMClient | None = None,
        deny: list[str] | None = None,
    ) -> None:
        self._records = records
        self._embedder = embedder
        self._store = store
        self._settings = settings
        self._llm = llm or NullLLM()
        self._category = {r.canonical: r.category for r in records}
        # Precompute per-merchant phrase token-tuples from all surface forms.
        self._phrases: list[tuple[MerchantRecord, list[tuple[str, ...]]]] = []
        for r in records:
            seen: set[tuple[str, ...]] = set()
            phrases: list[tuple[str, ...]] = []
            for form in r.surface_forms():
                pt = _phrase_tokens(form)
                if pt and pt not in seen:
                    seen.add(pt)
                    phrases.append(pt)
            self._phrases.append((r, phrases))
        # Per-merchant token vocabulary, for the embedding corroboration guard.
        self._merchant_tokens: dict[str, set[str]] = {}
        for r in records:
            toks: set[str] = set()
            for form in r.surface_forms():
                toks.update(_phrase_tokens(form))
            self._merchant_tokens[r.canonical] = toks
        # Denylist of known-confusable phrases -> force ABSTAIN.
        self._deny = [pt for pt in (_phrase_tokens(d) for d in (deny or [])) if pt]
        self._store.index(records, embedder)

    # ── rule floor ────────────────────────────────────────────────────────────
    @staticmethod
    def _phrase_hit(ptoks: tuple[str, ...], cand_set: frozenset[str]) -> bool:
        # Single token: must be specific (length >= 2, not a generic ambiguous word).
        # Multi-word: SUBSET match (every phrase token present) — robust to the
        # token reordering that hint-prepend + dedup introduce, while still
        # specific because multi-word brand phrases rarely co-occur by accident.
        if not ptoks:
            return False
        if len(ptoks) == 1:
            t = ptoks[0]
            return len(t) >= 2 and t not in AMBIGUOUS_SINGLE and t in cand_set
        return all(t in cand_set for t in ptoks)

    def _rule_match(self, tokens: tuple[str, ...]) -> _RuleOutcome:
        cand_set = frozenset(tokens)
        scored: list[tuple[MerchantRecord, int]] = []
        for record, phrases in self._phrases:
            best_len = 0
            for pt in phrases:
                if self._phrase_hit(pt, cand_set):
                    best_len = max(best_len, len(pt))
            if best_len > 0:
                scored.append((record, best_len))
        if not scored:
            return _RuleOutcome(None, [])
        scored.sort(key=lambda x: x[1], reverse=True)
        top_len = scored[0][1]
        winners = [r for r, ln in scored if ln == top_len]
        if len(winners) == 1:
            return _RuleOutcome(winners[0], [])
        return _RuleOutcome(None, winners)  # tie -> ambiguous, defer

    def _corroborated(self, canonical: str, tokens: tuple[str, ...]) -> bool:
        """An embedding auto-accept needs at least one NON-ambiguous token shared
        with the matched merchant. Stops 'COIN' (CoinSwitch) latching onto
        Zerodha Coin purely via the generic word."""
        signal = set(tokens) - AMBIGUOUS_SINGLE
        return bool(signal & self._merchant_tokens.get(canonical, set()))

    # ── main entry ──────────────────────────────────────────────────────────────
    def canonicalize(self, raw: str, hint: str | None = None) -> CanonResult:
        norm = normalize(raw, hint)
        s = self._settings

        # Denylist: known-confusable strings we refuse to resolve.
        cand_set = frozenset(norm.tokens)
        if any(dp and all(t in cand_set for t in dp) for dp in self._deny):
            return CanonResult(
                raw=raw, normalized=norm.text, canonical=None, category=None,
                confidence=0.0, method=Method.ABSTAIN, candidates=(),
            )

        rule = self._rule_match(norm.tokens)
        if rule.merchant is not None:
            m = rule.merchant
            return CanonResult(
                raw=raw, normalized=norm.text, canonical=m.canonical, category=m.category,
                confidence=1.0, method=Method.RULE,
                candidates=(Candidate(m.canonical, m.category, 1.0),),
            )

        # embedding nearest-neighbour
        vec = self._embedder.embed([norm.text])[0]
        candidates = self._store.search(vec, s.top_k)

        if rule.ambiguous:
            names = {m.canonical for m in rule.ambiguous}
            restricted = [c for c in candidates if c.canonical in names]
            candidates = restricted or [
                Candidate(m.canonical, m.category, 0.5) for m in rule.ambiguous
            ]

        best = candidates[0] if candidates else None

        # auto-accept a clear, unambiguous semantic match — but only if a
        # non-ambiguous token corroborates it (precision guard).
        if (
            best
            and not rule.ambiguous
            and best.score >= s.accept_threshold
            and self._corroborated(best.canonical, norm.tokens)
        ):
            return CanonResult(
                raw=raw, normalized=norm.text, canonical=best.canonical, category=best.category,
                confidence=best.score, method=Method.EMBEDDING, candidates=tuple(candidates),
            )

        # ambiguous middle -> LangGraph LLM adjudication (constrained to candidates)
        in_zone = bool(rule.ambiguous) or (best is not None and best.score >= s.llm_floor)
        if in_zone:
            decision = self._llm.resolve(raw, norm.text, tuple(candidates))
            if decision.canonical:
                category = self._category.get(decision.canonical) or next(
                    (c.category for c in candidates if c.canonical == decision.canonical), None
                )
                return CanonResult(
                    raw=raw, normalized=norm.text, canonical=decision.canonical, category=category,
                    confidence=decision.confidence, method=Method.LLM, candidates=tuple(candidates),
                )

        # nothing confident -> abstain (UNKNOWN)
        return CanonResult(
            raw=raw, normalized=norm.text, canonical=None, category=None,
            confidence=best.score if best else 0.0, method=Method.ABSTAIN, candidates=tuple(candidates),
        )

    def canonicalize_batch(self, items: list[tuple[str, str | None]]) -> list[CanonResult]:
        return [self.canonicalize(raw, hint) for raw, hint in items]
