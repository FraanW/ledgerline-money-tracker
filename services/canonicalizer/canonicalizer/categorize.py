"""M11 v1 — ML categorization fallback (hybrid, precision-first).

Composes ON TOP of M3 canonicalization. The ladder:

  1. merchant -> category : if M3 resolved the merchant, its category is the answer
                            (highest precision, ~free).
  2. keyword rules        : deterministic category keywords (FUEL->Fuel, RENT->Rent,
                            KIRANA->Groceries ...) for unknown-merchant text.
  3. embedding kNN vote   : vote categories of M3's nearest dictionary merchants,
                            weighted by similarity — accept only when confident.
  4. LangGraph LLM        : pick one category from the fixed taxonomy (capped),
                            constrained — can't invent a category.
  5. Uncategorized        : abstain rather than guess.

Reuses the Canonicalizer pipeline (and its store / spend / candidates) wholesale.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .normalize import Normalized, normalize
from .llm import LLMClient, NullLLM
from .pipeline import Canonicalizer
from .types import Candidate

TAXONOMY: tuple[str, ...] = (
    "Groceries", "Food Delivery", "Restaurants", "Transport", "Fuel",
    "OTT/Subscriptions", "Ecommerce/Shopping", "Utilities", "Telecom/Internet",
    "Pharmacy/Health", "Investments/Broking", "Insurance", "Fitness", "Education",
    "Travel", "Rent", "Cash withdrawal/ATM", "Income", "Personal Care",
)
UNCATEGORIZED = "Uncategorized"

CATEGORY_SYSTEM = (
    "You categorize an Indian bank / UPI / card transaction into exactly ONE "
    "spending category from the candidate list. Use the raw text and any hint. "
    "If it does not clearly fit any category, answer UNKNOWN. Respond with strict "
    'minified JSON and nothing else: {"canonical":"<one candidate category or '
    'UNKNOWN>","confidence":<0..1>,"reason":"<short>"}'
)

# Deterministic keyword floor. Order matters (first hit wins). Single tokens are
# whole-token matched; phrases (with a space) are substring-matched on the text.
_KEYWORDS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("SALARY", "PAYROLL", "STIPEND"), "Income"),
    (("RENT",), "Rent"),
    (("PETROL", "DIESEL", "FUEL", "PETROLEUM"), "Fuel"),
    (("ATM", "WDL", "NFS"), "Cash withdrawal/ATM"),
    (("PHARMACY", "PHARMA", "MEDICAL", "MEDICALS", "CHEMIST", "CLINIC", "HOSPITAL", "MEDICINE", "MEDICINES", "DIAGNOSTIC"), "Pharmacy/Health"),
    (("SALON", "SPA", "PARLOUR", "PARLOR", "BARBER"), "Personal Care"),
    (("INSURANCE", "PREMIUM", "POLICY", "ASSURANCE"), "Insurance"),
    (("SCHOOL", "COLLEGE", "TUITION", "COURSE", "ACADEMY", "COACHING", "UNIVERSITY"), "Education"),
    (("HOTEL", "RESORT", "FLIGHT", "AIRLINE", "TRAVELS", "TOURS", "AIRWAYS"), "Travel"),
    (("ELECTRICITY", "POWER", "WATER", "DISCOM"), "Utilities"),
    (("BROADBAND", "FIBER", "FIBERNET", "POSTPAID", "PREPAID", "RECHARGE", "DATAPACK"), "Telecom/Internet"),
    (("KIRANA", "GROCERY", "GROCERIES", "SUPERMARKET", "PROVISION", "BAZAAR", "GENERAL STORE"), "Groceries"),
    (("RESTAURANT", "CAFE", "BISTRO", "MESS", "DHABA", "SWEETS", "BAKERY", "CHAIWALA", "COFFEE", "EATERY"), "Restaurants"),
    (("CAB", "TAXI", "AUTORICKSHAW", "METRO", "TOLL", "FASTAG", "PARKING"), "Transport"),
    (("FOOTWEAR", "FASHION", "APPAREL", "ELECTRONICS", "BOUTIQUE"), "Ecommerce/Shopping"),
    (("GYM", "FITNESS"), "Fitness"),
)


@dataclass(frozen=True)
class CategoryResult:
    raw: str
    category: str
    confidence: float
    method: str  # merchant | rule | knn | llm | abstain
    merchant: str | None = None
    candidates: tuple[tuple[str, float], ...] = field(default=())

    def to_dict(self) -> dict:
        return {
            "raw": self.raw,
            "category": self.category,
            "confidence": round(self.confidence, 4),
            "method": self.method,
            "merchant": self.merchant,
            "candidates": [{"category": c, "score": round(s, 4)} for c, s in self.candidates],
        }


class Categorizer:
    def __init__(
        self,
        canonicalizer: Canonicalizer,
        llm: LLMClient | None = None,
        *,
        knn_score_floor: float = 0.62,  # parity with canonicalizer accept_threshold
        knn_share_floor: float = 0.5,
    ) -> None:
        self._canon = canonicalizer
        self._llm = llm or NullLLM()
        self._knn_score_floor = knn_score_floor
        self._knn_share_floor = knn_share_floor

    @staticmethod
    def _keyword_match(norm: Normalized) -> str | None:
        toks = set(norm.tokens)
        text = norm.text
        for kws, cat in _KEYWORDS:
            for kw in kws:
                if " " in kw:
                    if kw in text:
                        return cat
                elif kw in toks:
                    return cat
        return None

    def _knn_vote(self, candidates: tuple[Candidate, ...]) -> tuple[str, float, float] | None:
        """Returns (category, vote_share, best_score) or None."""
        if not candidates:
            return None
        agg: dict[str, float] = {}
        for c in candidates:
            agg[c.category] = agg.get(c.category, 0.0) + c.score
        total = sum(agg.values()) or 1.0
        cat = max(agg, key=lambda k: agg[k])
        share = agg[cat] / total
        best_score = max((c.score for c in candidates if c.category == cat), default=0.0)
        return cat, share, best_score

    def categorize(self, raw: str, hint: str | None = None, amount: float | None = None) -> CategoryResult:
        # 1) Merchant -> category floor (reuse M3).
        r = self._canon.canonicalize(raw, hint)
        if r.canonical is not None and r.category:
            return CategoryResult(raw, r.category, r.confidence, "merchant", merchant=r.canonical)

        norm = normalize(raw, hint)

        # 2) Keyword floor.
        kw = self._keyword_match(norm)
        if kw:
            return CategoryResult(raw, kw, 0.95, "rule")

        # 3) Embedding kNN vote over M3's nearest merchants.
        vote = self._knn_vote(r.candidates)
        cand_tuple = tuple((c.category, c.score) for c in r.candidates)
        if vote:
            cat, share, best = vote
            if best >= self._knn_score_floor and share >= self._knn_share_floor:
                return CategoryResult(raw, cat, best, "knn", candidates=cand_tuple)

        # 4) LangGraph LLM over the fixed taxonomy.
        taxonomy_candidates = tuple(Candidate(c, c, 0.0) for c in TAXONOMY)
        decision = self._llm.resolve(raw, norm.text, taxonomy_candidates)
        if decision.canonical in TAXONOMY:
            return CategoryResult(raw, decision.canonical, decision.confidence, "llm", candidates=cand_tuple)

        # 5) Abstain.
        return CategoryResult(raw, UNCATEGORIZED, vote[2] if vote else 0.0, "abstain", candidates=cand_tuple)
