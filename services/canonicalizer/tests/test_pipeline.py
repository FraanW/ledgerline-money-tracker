from canonicalizer.embeddings import HashingEmbedder
from canonicalizer.llm import MappingLLM, NullLLM
from canonicalizer.pipeline import Canonicalizer
from canonicalizer.types import Candidate, Method


class _StubStore:
    """Returns a fixed candidate list so we can drive the confidence gate
    deterministically (independent of embedding quality)."""

    def __init__(self, candidates: list[Candidate]):
        self._c = candidates

    def index(self, records, embedder):  # noqa: D401 - protocol stub
        pass

    def search(self, vector, k):
        return self._c[:k]


def test_rule_exact_single_token(canon):
    res = canon.canonicalize("UPI-SWIGGY-9876@ybl-Payment from ph", "SWIGGY")
    assert res.canonical == "Swiggy"
    assert res.method == Method.RULE
    assert res.confidence == 1.0


def test_rule_multiword_alias(canon):
    res = canon.canonicalize("POS 8842 DMART AVENUE SUPERMARTS PUN 4521", "DMART")
    assert res.canonical == "DMart"
    assert res.method == Method.RULE


def test_multiword_resolves_zerodha_coin(canon):
    res = canon.canonicalize("MANDATE/ZERODHA COIN/MF SIP 5512", "COIN")
    assert res.canonical == "Zerodha Coin"
    assert res.method == Method.RULE


def test_ambiguous_single_token_not_rule_accepted(canon):
    # bare COIN (CoinSwitch crypto in reality) must NOT auto-accept via the floor.
    res = canon.canonicalize("UPI/COIN/coinswitch@ybl/crypto", "COIN")
    assert res.method != Method.RULE


def test_abstains_on_unknown_local_merchant(canon):
    res = canon.canonicalize("UPI/SHARMA KIRANA STORE/sharma123@oksbi/Payment", "SHARMA KIRANA STORE")
    assert res.canonical is None
    assert res.method == Method.ABSTAIN


def test_embedding_autoaccept_with_corroboration(records, settings):
    # 'BAZAAR' corroborates Big Bazaar (a non-ambiguous shared token) but isn't a
    # single-token rule phrase, so we reach the embedding branch and accept.
    canon = Canonicalizer(
        records, HashingEmbedder(settings.embedding_dim),
        _StubStore([Candidate("Big Bazaar", "Groceries", 0.91)]), settings, NullLLM(),
    )
    res = canon.canonicalize("WEEKLY BAZAAR HAUL", "")
    assert res.method == Method.EMBEDDING
    assert res.canonical == "Big Bazaar"


def test_embedding_rejected_without_corroboration(records, settings):
    # High similarity but ZERO shared tokens -> precision guard abstains.
    canon = Canonicalizer(
        records, HashingEmbedder(settings.embedding_dim),
        _StubStore([Candidate("Zomato", "Food Delivery", 0.95)]), settings, NullLLM(),
    )
    res = canon.canonicalize("ZXQ TOTALLY UNRELATED STRING", "")
    assert res.method == Method.ABSTAIN


def test_llm_zone_consulted_and_resolves(records, settings):
    # mid-confidence candidate (in [llm_floor, accept)) -> LLM adjudicates.
    canon = Canonicalizer(
        records, HashingEmbedder(settings.embedding_dim),
        _StubStore([Candidate("Netflix", "OTT/Subscriptions", 0.5)]), settings, MappingLLM({"zxq": "Netflix"}),
    )
    res = canon.canonicalize("ZXQ OBSCURE THING", "")
    assert res.method == Method.LLM
    assert res.canonical == "Netflix"


def test_llm_zone_abstains_with_null_llm(records, settings):
    canon = Canonicalizer(
        records, HashingEmbedder(settings.embedding_dim),
        _StubStore([Candidate("Netflix", "OTT/Subscriptions", 0.5)]), settings, NullLLM(),
    )
    res = canon.canonicalize("ZXQ OBSCURE THING", "")
    assert res.canonical is None
    assert res.method == Method.ABSTAIN


def test_llm_cannot_invent_merchant_outside_candidates(records, settings):
    # MappingLLM points at a merchant NOT in the candidate set -> rejected -> abstain.
    canon = Canonicalizer(
        records, HashingEmbedder(settings.embedding_dim),
        _StubStore([Candidate("Netflix", "OTT/Subscriptions", 0.5)]), settings, MappingLLM({"zxq": "Swiggy"}),
    )
    res = canon.canonicalize("ZXQ OBSCURE THING", "")
    assert res.canonical is None
