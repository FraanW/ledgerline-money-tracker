import pytest

from canonicalizer.categorize import UNCATEGORIZED, Categorizer
from canonicalizer.embeddings import HashingEmbedder
from canonicalizer.llm import MappingLLM, NullLLM
from canonicalizer.pipeline import Canonicalizer
from canonicalizer.types import Candidate


@pytest.fixture
def categorizer(canon) -> Categorizer:
    return Categorizer(canon, NullLLM())


class _StubStore:
    def __init__(self, c):
        self._c = c

    def index(self, records, embedder):
        pass

    def search(self, vector, k):
        return self._c[:k]


def test_merchant_floor(categorizer):
    res = categorizer.categorize("UPI-SWIGGY-9876@ybl-Payment from ph", "SWIGGY")
    assert res.method == "merchant"
    assert res.category == "Food Delivery"
    assert res.merchant == "Swiggy"


def test_keyword_floor_kirana(categorizer):
    res = categorizer.categorize("UPI/SHARMA KIRANA STORE/sharma123@oksbi/Payment", "SHARMA KIRANA STORE")
    assert res.method == "rule"
    assert res.category == "Groceries"


def test_keyword_floor_fuel(categorizer):
    res = categorizer.categorize("POS LOCAL PETROL PUMP NH48 4521", "")
    assert res.category == "Fuel"


def test_abstains_to_uncategorized(categorizer):
    res = categorizer.categorize("IMPS/PRIYA SHARMA/personal transfer 8812", "PRIYA SHARMA")
    assert res.category == UNCATEGORIZED
    assert res.method == "abstain"


def test_knn_vote_categorizes_unknown_merchant(records, settings):
    store = _StubStore([Candidate("DMart", "Groceries", 0.66), Candidate("BigBasket", "Groceries", 0.64)])
    canon = Canonicalizer(records, HashingEmbedder(settings.embedding_dim), store, settings, NullLLM())
    cat = Categorizer(canon, NullLLM())
    res = cat.categorize("ZXQ UNKNOWN SHOP", "")
    assert res.method == "knn"
    assert res.category == "Groceries"


def test_llm_taxonomy_fallback(records, settings):
    # candidates too weak for kNN -> LangGraph-style LLM picks a taxonomy category.
    store = _StubStore([Candidate("Netflix", "OTT/Subscriptions", 0.3)])
    canon = Canonicalizer(records, HashingEmbedder(settings.embedding_dim), store, settings, NullLLM())
    cat = Categorizer(canon, MappingLLM({"zxq": "Transport"}))
    res = cat.categorize("ZXQ MYSTERY", "")
    assert res.method == "llm"
    assert res.category == "Transport"
