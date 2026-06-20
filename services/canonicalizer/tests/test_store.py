import numpy as np

from canonicalizer.embeddings import HashingEmbedder
from canonicalizer.store import InMemoryVectorStore


def test_search_returns_best_merchant_for_exact_form(records):
    emb = HashingEmbedder(384)
    store = InMemoryVectorStore()
    store.index(records, emb)
    q = emb.embed(["SWIGGY"])[0]
    cands = store.search(q, k=5)
    assert cands and cands[0].canonical == "Swiggy"
    assert 0.0 <= cands[0].score <= 1.0


def test_each_merchant_appears_once_despite_multiple_forms(records):
    emb = HashingEmbedder(384)
    store = InMemoryVectorStore()
    store.index(records, emb)
    cands = store.search(emb.embed(["DMART AVENUE SUPERMARTS"])[0], k=10)
    names = [c.canonical for c in cands]
    assert len(names) == len(set(names))          # aggregated per merchant
    assert "DMart" in names


def test_empty_store_returns_nothing():
    store = InMemoryVectorStore()
    assert store.search(np.zeros(384, dtype=np.float32), k=5) == []
