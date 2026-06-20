"""Evaluation harness + CI guardrail for M11-ML categorization.

- category_accuracy   : of rows with a real expected category, fraction predicted right.
- uncategorized_recall: of rows that should be Uncategorized, fraction we abstained on.
- false_categorization: Uncategorized rows we wrongly slapped a category on.
- method breakdown     : merchant / rule / knn / llm / abstain.

Exits non-zero on guardrail regression.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from canonicalizer.categorize import UNCATEGORIZED  # noqa: E402
from canonicalizer.config import get_settings  # noqa: E402
from canonicalizer.service import build_categorizer  # noqa: E402


def evaluate(path: str) -> dict:
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    cat = build_categorizer(get_settings())
    methods: Counter = Counter()
    cat_total = cat_correct = 0
    unc_total = unc_correct = false_cat = 0
    misses: list[dict] = []
    for r in rows:
        res = cat.categorize(r["raw"], r.get("merchantHint"))
        methods[res.method] += 1
        exp = r["expected"]
        if exp == UNCATEGORIZED:
            unc_total += 1
            if res.category == UNCATEGORIZED:
                unc_correct += 1
            else:
                false_cat += 1
                misses.append({"raw": r["raw"], "want": exp, "got": res.category, "via": res.method})
        else:
            cat_total += 1
            if res.category == exp:
                cat_correct += 1
            else:
                misses.append({"raw": r["raw"], "want": exp, "got": res.category, "via": res.method})
    return {
        "rows": len(rows),
        "category_accuracy": round(cat_correct / cat_total, 4) if cat_total else 0.0,
        "category_correct": cat_correct,
        "category_total": cat_total,
        "uncategorized_recall": round(unc_correct / unc_total, 4) if unc_total else 0.0,
        "uncategorized_total": unc_total,
        "false_categorization": false_cat,
        "methods": dict(methods),
        "misses": misses,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--evalset", default=str(Path(__file__).with_name("category_evalset.json")))
    ap.add_argument("--min-accuracy", type=float, default=0.85)
    ap.add_argument("--min-uncat-recall", type=float, default=0.80)
    ap.add_argument("--max-false-cat", type=int, default=1)
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
        print("== M11-ML categorization eval ==")
        print(f"  rows                 : {m['rows']}")
        print(f"  category accuracy    : {m['category_accuracy']:.1%}  ({m['category_correct']}/{m['category_total']})")
        print(f"  uncategorized recall : {m['uncategorized_recall']:.1%}  ({m['uncategorized_total']} expected)")
        print(f"  false categorization : {m['false_categorization']}   <- keep low")
        print(f"  methods              : {m['methods']}")
        for x in m["misses"]:
            print(f"     want {x['want']!r} got {x['got']!r} via {x['via']}  | {x['raw']}")

    ok = (
        m["category_accuracy"] >= args.min_accuracy
        and m["uncategorized_recall"] >= args.min_uncat_recall
        and m["false_categorization"] <= args.max_false_cat
    )
    print("guardrails OK" if ok else "GUARDRAIL FAILED", file=sys.stderr if not ok else sys.stdout)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
