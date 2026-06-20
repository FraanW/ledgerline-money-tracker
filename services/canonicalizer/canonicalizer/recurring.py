"""M3+ — recurring-charge & anomaly detection.

Statistical, interpretable ML over a transaction history. Groups transactions by
canonical merchant (reusing M3), then for each group decides whether it RECURS
(regular cadence + stable amount) and flags ANOMALIES:

  - trial_to_paid : a ~0 charge followed by paid charges (the free-trap)
  - price_hike    : a sustained step-up in the recurring amount
  - amount_spike  : a one-off charge far above the series norm
  - new_recurring : a series whose first charge is within the recent window
  - lapsed        : an expected charge that didn't arrive (at-risk / cancelled)

Powers the Subscription Leak / Latte Factor / Free-Trap / Pain Restorer lenses.
No heavy deps — pure stdlib statistics, so every decision is explainable.
"""
from __future__ import annotations

import math
import re
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from typing import Callable

# (label, canonical days, lo, hi) — a median inter-charge gap in [lo, hi] matches.
_CADENCES: tuple[tuple[str, int, int, int], ...] = (
    ("weekly", 7, 6, 8),
    ("biweekly", 14, 12, 17),
    ("monthly", 30, 26, 35),
    ("quarterly", 91, 80, 100),
    ("half-yearly", 182, 165, 200),
    ("yearly", 365, 345, 385),
)

_TOKEN = re.compile(r"[A-Z0-9']+")

# A resolver maps (raw, hint) -> (merchant_key | None, category | None). The
# service injects M3; the default is a dependency-free normalized key.
Resolver = Callable[[str, "str | None"], "tuple[str | None, str | None]"]


@dataclass(frozen=True)
class Txn:
    id: str
    date: str  # YYYY-MM-DD
    amount: float
    raw: str = ""
    merchant_hint: str | None = None
    method: str | None = None
    merchant: str | None = None  # if pre-resolved, used directly as the group key
    category: str | None = None  # if pre-resolved (e.g. from M11), carried onto the series


@dataclass(frozen=True)
class RecurringSeries:
    merchant: str
    category: str | None
    cadence: str
    period_days: float
    amount: float          # representative (median of paid charges)
    occurrences: int
    first_date: str
    last_date: str
    next_expected: str
    annualized: float
    confidence: float
    txn_ids: tuple[str, ...] = ()


@dataclass(frozen=True)
class Anomaly:
    type: str              # trial_to_paid | price_hike | amount_spike | new_recurring | lapsed
    merchant: str
    severity: str          # low | medium | high
    detail: str
    amount: float | None = None
    date: str | None = None


@dataclass(frozen=True)
class RecurringReport:
    series: tuple[RecurringSeries, ...]
    anomalies: tuple[Anomaly, ...]

    def to_dict(self) -> dict:
        return {
            "series": [s.__dict__ | {"txn_ids": list(s.txn_ids)} for s in self.series],
            "anomalies": [a.__dict__ for a in self.anomalies],
        }


def _default_resolver(raw: str, hint: str | None) -> tuple[str | None, str | None]:
    text = f"{hint or ''} {raw or ''}".upper()
    toks = [t for t in _TOKEN.findall(text) if len(t) >= 2][:2]
    return (" ".join(toks) or None, None)


def _ord(d: str) -> int:
    return date.fromisoformat(d).toordinal()


def _safe_ord(d: str) -> int | None:
    try:
        return date.fromisoformat(d).toordinal()
    except (ValueError, TypeError):
        return None


def _add_days(d: str, days: float) -> str:
    return date.fromordinal(_ord(d) + round(days)).isoformat()


def _match_cadence(median_gap: float) -> tuple[str, int] | None:
    for label, canon, lo, hi in _CADENCES:
        if lo <= median_gap <= hi:
            return label, canon
    return None


class RecurringDetector:
    def __init__(
        self,
        resolver: Resolver | None = None,
        *,
        min_occurrences: int = 3,
        amount_cv_max: float = 0.20,
        regularity_min: float = 0.6,
        spike_factor: float = 1.6,
        hike_factor: float = 1.12,
        recent_window_days: int = 40,
        trial_amount_max: float = 1.0,
    ) -> None:
        self._resolve = resolver or _default_resolver
        self.min_occurrences = min_occurrences
        self.amount_cv_max = amount_cv_max
        self.regularity_min = regularity_min
        self.spike_factor = spike_factor
        self.hike_factor = hike_factor
        self.recent_window_days = recent_window_days
        self.trial_amount_max = trial_amount_max

    def detect(self, txns: list[Txn]) -> RecurringReport:
        txns = [t for t in txns if _safe_ord(t.date) is not None]  # drop unparseable dates
        if not txns:
            return RecurringReport((), ())
        ref = max(_ord(t.date) for t in txns)  # dataset's latest date = "now"

        groups: dict[str, list[Txn]] = defaultdict(list)
        cats: dict[str, str | None] = {}
        for t in txns:
            key = t.merchant
            cat: str | None = t.category  # propagate a pre-resolved category (M11 path)
            if key is None:
                key, resolved = self._resolve(t.raw, t.merchant_hint)
                cat = cat or resolved
            if not key:
                continue
            groups[key].append(t)
            if cat and not cats.get(key):
                cats[key] = cat
            cats.setdefault(key, cat)

        series: list[RecurringSeries] = []
        anomalies: list[Anomaly] = []

        for merchant, items in groups.items():
            items = sorted(items, key=lambda x: _ord(x.date))
            self._scan_group(merchant, cats.get(merchant), items, ref, series, anomalies)

        series.sort(key=lambda s: s.annualized, reverse=True)
        anomalies.sort(key=lambda a: {"high": 0, "medium": 1, "low": 2}[a.severity])
        return RecurringReport(tuple(series), tuple(anomalies))

    def _scan_group(self, merchant, category, items, ref, series, anomalies) -> None:
        # Exclude non-finite amounts (would crash statistics) and negatives
        # (refunds/reversals — not a 'free trial', not a charge).
        paid = [t for t in items if math.isfinite(t.amount) and t.amount > self.trial_amount_max]
        trials = [t for t in items if math.isfinite(t.amount) and 0.0 <= t.amount <= self.trial_amount_max]

        # trial -> paid (works even with few paid charges)
        if trials and paid and _ord(trials[0].date) <= _ord(paid[0].date):
            first_paid = paid[0]
            anomalies.append(Anomaly(
                "trial_to_paid", merchant, "high",
                f"Free trial converted to a paid charge of {first_paid.amount:.0f}.",
                amount=first_paid.amount, date=first_paid.date,
            ))

        if len(paid) < self.min_occurrences:
            return

        dates = [_ord(t.date) for t in paid]
        gaps = [b - a for a, b in zip(dates, dates[1:])]
        if not gaps:
            return
        median_gap = statistics.median(gaps)
        match = _match_cadence(median_gap)
        if match is None:
            return  # irregular -> not a recurring series (precision-first)
        cadence, _canon = match

        # regularity: fraction of gaps within ±30% of the median gap
        within = sum(1 for g in gaps if 0.7 * median_gap <= g <= 1.3 * median_gap)
        regularity = within / len(gaps)
        if regularity < self.regularity_min:
            return

        amounts = [t.amount for t in paid]
        med_amt = statistics.median(amounts)
        cv = (statistics.pstdev(amounts) / med_amt) if med_amt else 1.0

        # price hike: later half sustained above earlier median by hike_factor
        half = len(amounts) // 2
        if half >= 1:
            early_med = statistics.median(amounts[:half])
            late_med = statistics.median(amounts[half:])
            if early_med and late_med >= early_med * self.hike_factor:
                anomalies.append(Anomaly(
                    "price_hike", merchant, "medium",
                    f"Price rose from ~{early_med:.0f} to ~{late_med:.0f}.",
                    amount=late_med, date=paid[-1].date,
                ))

        # amount spike: any single charge far above the median
        for t in paid:
            if t.amount >= med_amt * self.spike_factor and t.amount > med_amt + 2 * statistics.pstdev(amounts):
                anomalies.append(Anomaly(
                    "amount_spike", merchant, "medium",
                    f"Charge of {t.amount:.0f} is well above the usual ~{med_amt:.0f}.",
                    amount=t.amount, date=t.date,
                ))

        # Accept as recurring only if amounts are genuinely stable. Use a
        # median-proximity FRACTION (robust to a single outlier like a rent
        # deposit) rather than CV-or-cadence — cadence regularity must never
        # substitute for amount stability.
        # >=60% of charges cluster near the median: tolerates a single outlier
        # (rent deposit) and a late price step (the old price still dominates),
        # but rejects genuinely erratic amounts (which score ~0). Cadence
        # regularity never substitutes for this.
        near = sum(1 for a in amounts if abs(a - med_amt) <= 0.15 * med_amt) if med_amt else 0
        amount_stable = (near / len(amounts)) >= 0.6
        if not amount_stable:
            return

        period = median_gap
        last_date = paid[-1].date
        next_expected = _add_days(last_date, period)
        annualized = med_amt * (365.0 / period)
        confidence = round(
            min(1.0, 0.34 * min(1.0, len(paid) / 6) + 0.33 * regularity + 0.33 * (1 - min(1.0, cv / 0.3))),
            3,
        )
        series.append(RecurringSeries(
            merchant=merchant, category=category, cadence=cadence, period_days=period,
            amount=med_amt, occurrences=len(paid), first_date=paid[0].date, last_date=last_date,
            next_expected=next_expected, annualized=annualized, confidence=confidence,
            txn_ids=tuple(t.id for t in paid),
        ))

        # new recurring: first charge inside the recent window
        if ref - _ord(paid[0].date) <= self.recent_window_days:
            anomalies.append(Anomaly(
                "new_recurring", merchant, "low",
                f"New recurring charge detected (~{med_amt:.0f} {cadence}).",
                amount=med_amt, date=paid[0].date,
            ))

        # lapsed: a charge was expected by now but hasn't arrived (independent of
        # 'new' — a short recent series can be both new AND already lapsed).
        if ref - _ord(last_date) > period * 1.5:
            anomalies.append(Anomaly(
                "lapsed", merchant, "low",
                f"Expected a {cadence} charge by ~{next_expected} — none seen.",
                date=next_expected,
            ))
