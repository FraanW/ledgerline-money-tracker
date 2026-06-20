"""The LLM adjudication layer — orchestrated with LangGraph.

The deterministic stages decide most inputs. Only the *ambiguous middle*
(similarity in [llm_floor, accept_threshold)) reaches here. We model that
decision as a small LangGraph StateGraph so the control flow is explicit,
inspectable, and testable:

        START → budget_gate ─(ok)→ resolve → validate → END
                          └─(capped)──────→ deny ─────→ END

- budget_gate: consult the SpendGate; if the $-cap is hit, route to `deny`
  (ABSTAIN) without ever calling the model.
- resolve: ask the chat model to pick ONE candidate or say UNKNOWN (strict JSON).
- validate: accept only if the answer is one of the candidates we offered; clamp
  confidence; otherwise ABSTAIN. The model can never invent a merchant.

The chat model is injected (LangChain `BaseChatModel`), so tests drive the real
graph with a fake model — no network, fully deterministic. Any error anywhere
degrades to ABSTAIN; the LLM layer can never throw into the pipeline.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Protocol, Sequence

from .spend import SpendGate
from .types import Candidate

log = logging.getLogger(__name__)

_SYSTEM = (
    "You normalize noisy Indian bank / UPI / card transaction strings to a known "
    "merchant. You are given the raw string and a short list of CANDIDATE merchants. "
    "Choose the single best candidate ONLY if you are confident it is the same "
    "merchant; otherwise answer UNKNOWN. Never invent a merchant outside the "
    "candidate list. Respond with strict minified JSON and nothing else: "
    '{"canonical":"<exact candidate canonical or UNKNOWN>","confidence":<0..1>,"reason":"<short>"}'
)

_JSON = re.compile(r"\{.*\}", re.DOTALL)


@dataclass(frozen=True)
class LLMDecision:
    canonical: str | None
    confidence: float
    reason: str = ""


class LLMClient(Protocol):
    def resolve(self, raw: str, normalized: str, candidates: Sequence[Candidate]) -> LLMDecision: ...


class NullLLM:
    """Default: always abstains. Used when the LLM is disabled."""

    def resolve(self, raw: str, normalized: str, candidates: Sequence[Candidate]) -> LLMDecision:
        return LLMDecision(None, 0.0, "llm disabled")


class MappingLLM:
    """Deterministic, dependency-free stub for demos/tests: maps a case-insensitive
    substring of the raw/normalized text to a canonical. Honours the candidate set."""

    def __init__(self, mapping: dict[str, str], confidence: float = 0.8) -> None:
        self._map = {k.lower(): v for k, v in mapping.items()}
        self._conf = confidence

    def resolve(self, raw: str, normalized: str, candidates: Sequence[Candidate]) -> LLMDecision:
        hay = f"{raw} {normalized}".lower()
        allowed = {c.canonical for c in candidates}
        for needle, canonical in self._map.items():
            if needle in hay and (not allowed or canonical in allowed):
                return LLMDecision(canonical, self._conf, "stub match")
        return LLMDecision(None, 0.0, "stub no-match")


def _parse(content: str) -> tuple[str | None, float, str]:
    m = _JSON.search(content or "")
    if not m:
        return None, 0.0, "unparseable"
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None, 0.0, "bad json"
    canonical = data.get("canonical")
    if not isinstance(canonical, str) or canonical.strip().upper() == "UNKNOWN":
        canonical = None
    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    return canonical, max(0.0, min(1.0, conf)), str(data.get("reason", ""))[:140]


class LangGraphLLM:
    """LLM adjudication as a compiled LangGraph StateGraph (see module docstring)."""

    def __init__(self, chat_model, spend_gate: SpendGate, llm_floor: float = 0.40, system_prompt: str | None = None) -> None:
        self._chat = chat_model
        self._spend = spend_gate
        self._floor = llm_floor
        self._system = system_prompt or _SYSTEM
        self._graph = self._build()

    def _build(self):
        from typing import TypedDict  # local to keep import surface tight

        from langgraph.graph import END, START, StateGraph

        floor = self._floor
        chat = self._chat
        spend = self._spend
        system = self._system

        class S(TypedDict, total=False):
            raw: str
            normalized: str
            candidates: list[dict]
            allowed: list[str]
            canonical: str | None
            confidence: float
            reason: str
            budget_ok: bool

        def budget_gate(state):
            return {"budget_ok": spend.can_spend()}

        def route(state):
            return "resolve" if state.get("budget_ok") else "deny"

        def resolve(state):
            from langchain_core.messages import HumanMessage, SystemMessage

            lines = [
                f"{i+1}. {c['canonical']} ({c['category']}) sim={c['score']:.2f}"
                for i, c in enumerate(state["candidates"])
            ]
            human = (
                f"RAW: {state['raw']}\nNORMALIZED: {state['normalized']}\n"
                f"CANDIDATES:\n" + "\n".join(lines)
            )
            try:
                resp = chat.invoke([SystemMessage(content=system), HumanMessage(content=human)])
                spend.record()
                content = resp.content if isinstance(resp.content, str) else str(resp.content)
                canonical, conf, reason = _parse(content)
                return {"canonical": canonical, "confidence": conf, "reason": reason}
            except Exception as exc:  # never throw into the pipeline
                log.warning("LangGraph resolve failed: %s", exc)
                return {"canonical": None, "confidence": 0.0, "reason": f"error: {exc}"}

        def validate(state):
            canonical = state.get("canonical")
            allowed = set(state.get("allowed") or [])
            if not canonical or (allowed and canonical not in allowed):
                return {"canonical": None, "confidence": 0.0, "reason": "not a candidate"}
            conf = max(floor, float(state.get("confidence") or 0.0))
            return {"canonical": canonical, "confidence": min(1.0, conf)}

        def deny(state):
            return {"canonical": None, "confidence": 0.0, "reason": "spend cap reached"}

        g = StateGraph(S)
        g.add_node("budget_gate", budget_gate)
        g.add_node("resolve", resolve)
        g.add_node("validate", validate)
        g.add_node("deny", deny)
        g.add_edge(START, "budget_gate")
        g.add_conditional_edges("budget_gate", route, {"resolve": "resolve", "deny": "deny"})
        g.add_edge("resolve", "validate")
        g.add_edge("validate", END)
        g.add_edge("deny", END)
        return g.compile()

    def resolve(self, raw: str, normalized: str, candidates: Sequence[Candidate]) -> LLMDecision:
        state = {
            "raw": raw,
            "normalized": normalized,
            "candidates": [
                {"canonical": c.canonical, "category": c.category, "score": c.score} for c in candidates
            ],
            "allowed": [c.canonical for c in candidates],
        }
        try:
            out = self._graph.invoke(state)
        except Exception as exc:  # pragma: no cover - defensive
            log.warning("LangGraph invoke failed: %s", exc)
            return LLMDecision(None, 0.0, f"graph error: {exc}")
        return LLMDecision(out.get("canonical"), float(out.get("confidence") or 0.0), str(out.get("reason", "")))


def build_llm(settings, spend_gate: SpendGate, system_prompt: str | None = None) -> LLMClient:
    """Factory: a LangGraph-backed OpenRouter client when enabled + importable +
    keyed; otherwise the abstaining NullLLM. `system_prompt` lets the same graph
    choose a category instead of a merchant. Never raises."""
    if not settings.llm_enabled:
        return NullLLM()
    if not settings.openrouter_api_key:
        log.warning("CANON_LLM_ENABLED but no openrouter_api_key; LLM disabled")
        return NullLLM()
    try:
        from langchain_openai import ChatOpenAI

        chat = ChatOpenAI(
            model=settings.openrouter_model,
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
            temperature=0,
            timeout=settings.llm_timeout_s,
            max_retries=1,
        )
        return LangGraphLLM(chat, spend_gate, settings.llm_floor, system_prompt)
    except Exception as exc:  # pragma: no cover - env-dependent
        log.warning("LangGraph/LangChain unavailable (%s); LLM disabled", exc)
        return NullLLM()
