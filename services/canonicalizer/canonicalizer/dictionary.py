"""Load the merchant dictionary (canonical + aliases + tokens) into records."""
from __future__ import annotations

import json
from pathlib import Path

from .types import MerchantRecord


def _load(path: str | Path) -> dict | list:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_dictionary(path: str | Path) -> list[MerchantRecord]:
    data = _load(path)
    items = data["dictionary"] if isinstance(data, dict) and "dictionary" in data else data
    records: list[MerchantRecord] = []
    for it in items:
        records.append(
            MerchantRecord(
                canonical=str(it["canonical"]),
                category=str(it.get("category", "Unknown")),
                aliases=tuple(str(a) for a in it.get("aliases", [])),
                tokens=tuple(str(t) for t in it.get("tokens", [])),
            )
        )
    return records


def load_deny(path: str | Path) -> list[str]:
    """Known-confusable / defunct strings we deliberately refuse to resolve
    (force ABSTAIN), e.g. 'UBER EATS' (exited India) which would otherwise
    rule-match Uber. A real canonicalizer's safety valve."""
    data = _load(path)
    if isinstance(data, dict):
        return [str(x) for x in data.get("deny", [])]
    return []
