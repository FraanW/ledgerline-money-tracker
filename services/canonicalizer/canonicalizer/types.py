"""Immutable domain types shared across the pipeline. Kept dependency-free so
every layer (normalize, store, llm, api, eval, tests) speaks the same language."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Method(str, Enum):
    """How a result was decided — surfaced for explainability and audit."""

    RULE = "rule"            # deterministic alias/token match (the floor)
    EMBEDDING = "embedding"  # semantic nearest-neighbour above accept_threshold
    LLM = "llm"              # adjudicated by the capped LLM fallback
    ABSTAIN = "abstain"      # nothing confident -> UNKNOWN (a safe non-answer)


@dataclass(frozen=True)
class MerchantRecord:
    canonical: str
    category: str
    aliases: tuple[str, ...] = ()
    tokens: tuple[str, ...] = ()

    def surface_forms(self) -> list[str]:
        """All strings that should embed/index to this merchant."""
        seen: list[str] = []
        for s in (self.canonical, *self.aliases, *self.tokens):
            if s and s not in seen:
                seen.append(s)
        return seen


@dataclass(frozen=True)
class Candidate:
    canonical: str
    category: str
    score: float  # cosine similarity 0..1 (or 1.0 for a rule hit)


@dataclass(frozen=True)
class CanonResult:
    raw: str
    normalized: str
    canonical: str | None        # None == abstained / unknown
    category: str | None
    confidence: float            # 0..1
    method: Method
    candidates: tuple[Candidate, ...] = field(default=())

    @property
    def is_known(self) -> bool:
        return self.canonical is not None

    def to_dict(self) -> dict:
        return {
            "raw": self.raw,
            "normalized": self.normalized,
            "canonical": self.canonical,
            "category": self.category,
            "confidence": round(self.confidence, 4),
            "method": self.method.value,
            "candidates": [
                {"canonical": c.canonical, "category": c.category, "score": round(c.score, 4)}
                for c in self.candidates
            ],
        }
