"""Exercises the real compiled LangGraph StateGraph with a fake chat model —
no network. Skipped if langgraph/langchain-core aren't installed."""
import pytest

pytest.importorskip("langgraph")
pytest.importorskip("langchain_core")

from langchain_core.language_models.fake_chat_models import FakeListChatModel  # noqa: E402

from canonicalizer.llm import LangGraphLLM  # noqa: E402
from canonicalizer.spend import SpendGate  # noqa: E402
from canonicalizer.types import Candidate  # noqa: E402

CANDS = [Candidate("Netflix", "OTT/Subscriptions", 0.5), Candidate("Spotify", "OTT/Subscriptions", 0.42)]


def _llm(responses, cap=1.0, cost=0.001, floor=0.4):
    gate = SpendGate(cap_usd=cap, cost_per_call_usd=cost)
    return LangGraphLLM(FakeListChatModel(responses=responses), gate, llm_floor=floor), gate


def test_resolve_picks_a_candidate_and_spends():
    llm, gate = _llm(['{"canonical":"Netflix","confidence":0.9,"reason":"ott"}'])
    dec = llm.resolve("NFLX MONTHLY", "NETFLIX", CANDS)
    assert dec.canonical == "Netflix"
    assert dec.confidence >= 0.4
    assert gate.spent_usd > 0  # the resolve node recorded spend


def test_budget_gate_short_circuits_without_calling_model():
    # cap 0 -> can_spend() False -> graph routes to `deny` (no model call, no spend).
    llm, gate = _llm(['{"canonical":"Netflix","confidence":0.9}'], cap=0.0)
    dec = llm.resolve("NFLX", "NETFLIX", CANDS)
    assert dec.canonical is None
    assert gate.spent_usd == 0.0


def test_validate_rejects_non_candidate():
    # model returns a merchant not offered -> validation node abstains.
    llm, _ = _llm(['{"canonical":"Hotstar","confidence":0.95}'])
    dec = llm.resolve("X", "X", CANDS)
    assert dec.canonical is None


def test_unknown_response_abstains():
    llm, _ = _llm(['{"canonical":"UNKNOWN","confidence":0.1}'])
    dec = llm.resolve("X", "X", CANDS)
    assert dec.canonical is None


def test_garbage_response_degrades_to_abstain():
    llm, _ = _llm(["not json at all"])
    dec = llm.resolve("X", "X", CANDS)
    assert dec.canonical is None
