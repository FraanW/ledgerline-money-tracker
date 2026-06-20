"""Hard spend gate for the LLM fallback. In-process accumulator with a cap that
mirrors the project's $3 OpenRouter ceiling. Once cumulative estimated spend
reaches the cap, `can_spend()` returns False and the LangGraph budget node routes
straight to ABSTAIN — the LLM is never called again.

Production note: persist `_spent` to Redis/DB so the cap holds across processes
and restarts. The interface stays identical; only the backing store changes.
"""
from __future__ import annotations

import threading


class SpendGate:
    def __init__(self, cap_usd: float, cost_per_call_usd: float) -> None:
        self._cap = max(0.0, cap_usd)
        self._cost = max(0.0, cost_per_call_usd)
        self._spent = 0.0
        self._lock = threading.Lock()

    def can_spend(self) -> bool:
        """True if one more call stays within the cap."""
        with self._lock:
            return self._spent + self._cost <= self._cap + 1e-9

    def record(self, cost: float | None = None) -> None:
        with self._lock:
            self._spent += self._cost if cost is None else max(0.0, cost)

    @property
    def spent_usd(self) -> float:
        with self._lock:
            return round(self._spent, 6)

    @property
    def remaining_usd(self) -> float:
        with self._lock:
            return round(max(0.0, self._cap - self._spent), 6)
