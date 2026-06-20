"""Wire the pieces into a ready Canonicalizer from settings."""
from __future__ import annotations

from pathlib import Path

from .categorize import CATEGORY_SYSTEM, Categorizer
from .config import Settings, get_settings
from .dictionary import load_deny, load_dictionary
from .embeddings import get_embedder
from .llm import LLMClient, build_llm
from .pipeline import Canonicalizer
from .recurring import RecurringDetector, _default_resolver
from .spend import SpendGate
from .store import InMemoryVectorStore, PgVectorStore

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _resolve(path: str) -> Path:
    p = Path(path)
    if p.is_absolute() and p.exists():
        return p
    if p.exists():
        return p
    return SERVICE_ROOT / path


def build_canonicalizer(
    settings: Settings | None = None,
    dictionary_path: str | None = None,
    *,
    spend: SpendGate | None = None,
    llm: LLMClient | None = None,
) -> Canonicalizer:
    settings = settings or get_settings()
    path = _resolve(dictionary_path or settings.dictionary_path)
    records = load_dictionary(path)
    deny = load_deny(path)
    embedder = get_embedder(settings)
    store = PgVectorStore(settings.database_url) if settings.database_url else InMemoryVectorStore()
    spend = spend or SpendGate(settings.llm_spend_cap_usd, settings.llm_cost_per_call_usd)
    llm = llm if llm is not None else build_llm(settings, spend)
    return Canonicalizer(records, embedder, store, settings, llm, deny=deny)


def build_categorizer(settings: Settings | None = None) -> Categorizer:
    """M11 v1 categorizer composed over M3, sharing ONE spend gate so the LLM
    `$`-cap spans both merchant resolution and category adjudication."""
    settings = settings or get_settings()
    spend = SpendGate(settings.llm_spend_cap_usd, settings.llm_cost_per_call_usd)
    canon = build_canonicalizer(settings, spend=spend, llm=build_llm(settings, spend))
    category_llm = build_llm(settings, spend, system_prompt=CATEGORY_SYSTEM)
    return Categorizer(canon, category_llm)


def make_resolver(canon: Canonicalizer):
    """A merchant resolver for the recurring detector: canonical merchant when
    M3 resolves it, else a normalized-key fallback (so unknown merchants still
    group and can be detected as recurring)."""
    def resolver(raw: str, hint: str | None):
        r = canon.canonicalize(raw, hint)
        if r.canonical:
            return (r.canonical, r.category)
        return _default_resolver(raw, hint)

    return resolver


def build_recurring_detector(settings: Settings | None = None, canon: Canonicalizer | None = None) -> RecurringDetector:
    settings = settings or get_settings()
    canon = canon or build_canonicalizer(settings)
    return RecurringDetector(make_resolver(canon))
