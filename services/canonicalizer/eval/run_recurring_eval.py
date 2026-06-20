"""Evaluation harness + CI guardrail for recurring-charge & anomaly detection.

- recurring P/R/F1 : detected recurring merchants vs the planted ground truth.
- anomaly recall   : planted (type, merchant) anomalies we caught.
- anomaly fp       : anomalies on series NOT planted (precision).

Exits non-zero on guardrail regression.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canonicalizer.recurring import RecurringDetector, Txn  # noqa: E402


def evaluate(path: str) -> dict:
    blob = json.loads(Path(path).read_text(encoding="utf-8"))
    gt = blob["ground_truth"]
    txns = [
        Txn(id=t["id"], date=t["date"], amount=float(t["amount"]), merchant=t.get("merchant"),
            raw=t.get("raw", ""), merchant_hint=t.get("merchant_hint"))
        for t in blob["transactions"]
    ]
    report = RecurringDetector().detect(txns)

    detected = {s.merchant for s in report.series}
    expected = set(gt["recurring"])
    tp = detected & expected
    precision = len(tp) / len(detected) if detected else 0.0
    recall = len(tp) / len(expected) if expected else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    detected_anoms = {(a.type, a.merchant) for a in report.anomalies}
    expected_anoms = {(a["type"], a["merchant"]) for a in gt["anomalies"]}
    anom_hits = detected_anoms & expected_anoms
    anom_recall = len(anom_hits) / len(expected_anoms) if expected_anoms else 0.0
    anom_fp = len(detected_anoms - expected_anoms)

    return {
        "recurring": {
            "detected": sorted(detected), "expected": sorted(expected),
            "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3),
            "false_positives": sorted(detected - expected), "missed": sorted(expected - detected),
        },
        "anomalies": {
            "detected": sorted(f"{t}:{m}" for t, m in detected_anoms),
            "recall": round(anom_recall, 3), "false_positives": anom_fp,
            "missed": sorted(f"{t}:{m}" for t, m in (expected_anoms - detected_anoms)),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--evalset", default=str(Path(__file__).with_name("txn_history.json")))
    ap.add_argument("--min-f1", type=float, default=0.85)
    ap.add_argument("--min-anom-recall", type=float, default=0.75)
    ap.add_argument("--max-anom-fp", type=int, default=2)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    m = evaluate(args.evalset)
    if args.json:
        print(json.dumps(m, indent=2))
    else:
        rc, an = m["recurring"], m["anomalies"]
        print("== Recurring & anomaly eval ==")
        print(f"  recurring   : P={rc['precision']:.0%} R={rc['recall']:.0%} F1={rc['f1']:.0%}  ({len(rc['detected'])} found)")
        if rc["false_positives"]:
            print(f"     false recurring: {rc['false_positives']}")
        if rc["missed"]:
            print(f"     missed recurring: {rc['missed']}")
        print(f"  anomalies   : recall={an['recall']:.0%}  fp={an['false_positives']}")
        print(f"     detected: {an['detected']}")
        if an["missed"]:
            print(f"     missed: {an['missed']}")

    ok = (
        m["recurring"]["f1"] >= args.min_f1
        and m["anomalies"]["recall"] >= args.min_anom_recall
        and m["anomalies"]["false_positives"] <= args.max_anom_fp
    )
    print("guardrails OK" if ok else "GUARDRAIL FAILED", file=sys.stdout if ok else sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
