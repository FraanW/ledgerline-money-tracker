"""Offline evaluation harness + CI guardrail.

Runs the pipeline over the labeled evalset and reports the metrics that matter
for a precision-first canonicaliser:

- known_accuracy   : of rows that SHOULD map, fraction mapped to the right merchant.
- abstain_recall   : of rows that should be UNKNOWN, fraction we correctly abstained on.
- false_accept     : UNKNOWN rows we WRONGLY mapped to a merchant — the dangerous
                     error. Guardrail: must stay at/under --max-false-accept (default 0).
- mislabels        : known rows mapped to the WRONG merchant (also dangerous).
- coverage         : fraction of all rows we gave a confident answer for.
- accept_precision : of all confident answers, fraction correct.

Exits non-zero if a guardrail regresses, so CI can gate on it.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canonicalizer.config import get_settings  # noqa: E402
from canonicalizer.service import build_canonicalizer  # noqa: E402


def evaluate(evalset_path: str) -> dict:
    rows = json.loads(Path(evalset_path).read_text(encoding="utf-8"))
    canon = build_canonicalizer(get_settings())

    known_total = known_correct = known_wrong = known_abstained = 0
    unknown_total = abstain_correct = false_accept = 0
    methods: Counter = Counter()
    mislabels: list[dict] = []
    false_accepts: list[dict] = []

    for r in rows:
        res = canon.canonicalize(r["raw"], r.get("merchantHint"))
        methods[res.method.value] += 1
        expected = r["expected"]
        pred = res.canonical

        if expected == "UNKNOWN":
            unknown_total += 1
            if pred is None:
                abstain_correct += 1
            else:
                false_accept += 1
                false_accepts.append({"raw": r["raw"], "got": pred, "method": res.method.value})
        else:
            known_total += 1
            if pred == expected:
                known_correct += 1
            elif pred is None:
                known_abstained += 1
            else:
                known_wrong += 1
                mislabels.append({"raw": r["raw"], "want": expected, "got": pred, "method": res.method.value})

    total = known_total + unknown_total
    confident_correct = known_correct
    confident_count = known_correct + known_wrong + false_accept  # all non-abstain answers
    return {
        "total": total,
        "known": {
            "total": known_total,
            "correct": known_correct,
            "wrong": known_wrong,
            "abstained": known_abstained,
            "accuracy": round(known_correct / known_total, 4) if known_total else 0.0,
        },
        "unknown": {
            "total": unknown_total,
            "abstain_correct": abstain_correct,
            "false_accept": false_accept,
            "abstain_recall": round(abstain_correct / unknown_total, 4) if unknown_total else 0.0,
        },
        "coverage": round(confident_count / total, 4) if total else 0.0,
        "accept_precision": round(confident_correct / confident_count, 4) if confident_count else 0.0,
        "methods": dict(methods),
        "mislabels": mislabels,
        "false_accepts": false_accepts,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--evalset", default=str(Path(__file__).with_name("evalset.json")))
    ap.add_argument("--min-known-acc", type=float, default=0.80)
    ap.add_argument("--min-abstain-recall", type=float, default=0.70)
    ap.add_argument("--max-false-accept", type=int, default=0)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    try:  # Windows consoles default to cp1252; box-drawing chars need utf-8.
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    m = evaluate(args.evalset)
    if args.json:
        print(json.dumps(m, indent=2))
    else:
        k, u = m["known"], m["unknown"]
        print("── Canonicalizer eval ─────────────────────────────────────")
        print(f"  rows                 : {m['total']}")
        print(f"  known accuracy       : {k['accuracy']:.1%}  ({k['correct']}/{k['total']}; wrong={k['wrong']}, abstained={k['abstained']})")
        print(f"  abstain recall (UNK) : {u['abstain_recall']:.1%}  ({u['abstain_correct']}/{u['total']})")
        print(f"  FALSE ACCEPTS (UNK)  : {u['false_accept']}   <- must be 0")
        print(f"  coverage             : {m['coverage']:.1%}")
        print(f"  accept precision     : {m['accept_precision']:.1%}")
        print(f"  methods              : {m['methods']}")
        if m["mislabels"]:
            print("  -- mislabels (known -> wrong) --")
            for x in m["mislabels"]:
                print(f"     want {x['want']!r} got {x['got']!r} via {x['method']}  | {x['raw']}")
        if m["false_accepts"]:
            print("  -- FALSE ACCEPTS (unknown -> merchant) --")
            for x in m["false_accepts"]:
                print(f"     got {x['got']!r} via {x['method']}  | {x['raw']}")
        print("───────────────────────────────────────────────────────────")

    ok = (
        m["known"]["accuracy"] >= args.min_known_acc
        and m["unknown"]["abstain_recall"] >= args.min_abstain_recall
        and m["unknown"]["false_accept"] <= args.max_false_accept
    )
    if not ok:
        print("GUARDRAIL FAILED", file=sys.stderr)
        return 1
    print("guardrails OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
