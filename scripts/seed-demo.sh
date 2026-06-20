#!/usr/bin/env bash
# =============================================================================
# seed-demo.sh — stand up "Anaya's household" through the REAL API (Sweep 2).
# =============================================================================
# Everything flows through HTTP (no direct SQL): identity → workspace →
# account → categories+rules → income → funded envelopes → a 3-month CSV
# statement through the actual M1→M11→M12 engine. Idempotent-ish: provisioning
# upserts by email; re-running re-uploads the same statement (dedup absorbs it)
# but WILL re-post income/allocations — run against a fresh workspace for a
# clean demo.
#
# Usage:  ./seed-demo.sh [API_BASE]     (default http://localhost:8090)
# Prints: LL_USER / LL_TENANT ids — paste into the app's dev login if needed.
# =============================================================================
set -euo pipefail
B="${1:-http://localhost:8090}"

jqv() { python -c "import sys,json;print(json.load(sys.stdin)['$1'])" 2>/dev/null; }

say() { printf '\n== %s\n' "$*"; }

say "identity: Anaya (owner) + Rohan (viewer) + workspace"
USER=$(curl -sf -X POST "$B/api/v0/identity/users" -H "Content-Type: application/json" \
  -d '{"email":"anaya@demo.ledgerline","displayName":"Anaya Sharma"}' | jqv userId)
VIEWER=$(curl -sf -X POST "$B/api/v0/identity/users" -H "Content-Type: application/json" \
  -d '{"email":"rohan@demo.ledgerline","displayName":"Rohan Sharma"}' | jqv userId)
TENANT=$(curl -sf -X POST "$B/api/v0/identity/workspaces" -H "Content-Type: application/json" \
  -d "{\"ownerUserId\":\"$USER\",\"displayName\":\"Sharma Household\"}" | jqv tenantId)
H=(-H "X-Tenant-Id: $TENANT" -H "X-User-Id: $USER")
echo "  LL_USER=$USER"
echo "  LL_TENANT=$TENANT"

say "account"
ACC=$(curl -sf -X POST "$B/api/v0/accounts" "${H[@]}" -H "Content-Type: application/json" \
  -d '{"institution":"HDFC Bank","accountType":"savings","maskedNumber":"XXXX4821"}' | jqv accountId)

say "categories"
declare -A CAT
for spec in "Salary:income" "Groceries:expense" "Rent:expense" "Dining:expense" "Transport:expense" "Fun:expense" "Savings:expense"; do
  name="${spec%%:*}"; kind="${spec##*:}"
  CAT[$name]=$(curl -sf -X POST "$B/api/v0/categories" "${H[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\",\"kind\":\"$kind\"}" | jqv categoryId)
done

say "rules (the Tag Workshop set)"
rule() { curl -sf -X POST "$B/api/v0/rules" "${H[@]}" -H "Content-Type: application/json" \
  -d "{\"patternKind\":\"$1\",\"pattern\":\"$2\",\"categoryId\":\"${CAT[$3]}\",\"priority\":$4}" >/dev/null; }
rule contains BIGBAZAAR  Groceries 10
rule contains BLINKIT    Groceries 11
rule contains SWIGGY     Dining    20
rule contains ZOMATO     Dining    21
rule contains UBER       Transport 30
rule contains OLA        Transport 31
rule contains NETFLIX    Fun       40
rule contains BOOKMYSHOW Fun       41
rule regex   "NEFT.*RENT" Rent     50
rule contains SALARY     Salary    60

say "income: 3 months of salary into the budget (Apr-Jun 2026)"
for m in "April" "May" "June"; do
  curl -sf -X POST "$B/api/v0/budget/income" "${H[@]}" -H "Content-Type: application/json" \
    -d "{\"amountMinor\":8200000,\"description\":\"salary $m\"}" >/dev/null
done

say "envelopes for 2026-06, anchored + funded"
envfund() { # name categoryName fundMinor
  local eid
  eid=$(curl -sf -X POST "$B/api/v0/budget/envelopes" "${H[@]}" -H "Content-Type: application/json" \
    -d "{\"name\":\"$1\",\"period\":\"2026-06\",\"categoryId\":\"${CAT[$2]}\"}" | jqv envelopeId)
  curl -sf -X POST "$B/api/v0/budget/allocate" "${H[@]}" -H "Content-Type: application/json" \
    -d "{\"toEnvelopeId\":\"$eid\",\"amountMinor\":$3,\"description\":\"budget $1\"}" >/dev/null
}
envfund Rent      Rent      2000000
envfund Groceries Groceries  600000
envfund Dining    Dining     400000
envfund Transport Transport  300000
envfund Fun       Fun        200000
envfund Savings   Savings   1500000

say "statement: 3 months of transactions through the real engine"
# NOTE: a named file, not mktemp + ";filename=" — the curl on Windows/Git-Bash
# exits 26 on the embedded-suffix form. curl sends the basename as filename.
CSV=/tmp/hdfc-apr-jun-2026.csv
cat > "$CSV" <<'EOF'
Date,Description,Debit,Credit
2026-04-01,NEFT SALARY ACME APR,,82000.00
2026-04-03,NEFT TRANSFER RENT APR,20000.00,
2026-04-08,UPI/BIGBAZAAR/3321,2480.50,
2026-04-12,UPI/SWIGGY/118822,420.00,
2026-04-19,UPI/UBER/77121,310.00,
2026-04-25,UPI/NETFLIX/SUB,649.00,
2026-05-01,NEFT SALARY ACME MAY,,82000.00
2026-05-03,NEFT TRANSFER RENT MAY,20000.00,
2026-05-07,UPI/BLINKIT/88311,1860.00,
2026-05-11,UPI/ZOMATO/45112,560.00,
2026-05-16,UPI/OLA/99213,275.00,
2026-05-21,UPI/CHAAYOS/1182,340.00,
2026-05-26,UPI/BOOKMYSHOW/MOV,800.00,
2026-06-01,NEFT SALARY ACME JUN,,82000.00
2026-06-03,NEFT TRANSFER RENT JUN,20000.00,
2026-06-05,UPI/BIGBAZAAR/9921,2190.00,
2026-06-08,UPI/SWIGGY/220011,385.00,
2026-06-12,UPI/UBER/31022,290.00,
2026-06-15,UPI/SWIGGY/220914,450.00,
2026-06-18,UPI/BLINKIT/77231,940.00,
2026-06-21,UPI/NETFLIX/SUB,649.00,
2026-06-24,UPI/KIRANA STORE/CASH,520.00,
EOF
INGEST_CODE=$(curl -s -o /tmp/ll-ingest.json -w "%{http_code}" -X POST "$B/api/v0/ingest/statement" "${H[@]}" \
  -F "accountId=$ACC" -F "file=@$CSV")
echo "  http=$INGEST_CODE $(cat /tmp/ll-ingest.json)"
rm -f "$CSV"
[ "$INGEST_CODE" = "200" ] || { echo "INGEST FAILED — aborting seed"; exit 1; }

say "holdings"
hold() { curl -sf -X POST "$B/api/v0/holdings" "${H[@]}" -H "Content-Type: application/json" -d "$1" >/dev/null; }
hold '{"name":"Nifty 50 Index Fund","kind":"index","investedMinor":25000000,"valueMinor":32200000,"expenseRatioBps":20}'
hold '{"name":"Flexi-cap Fund (Regular)","kind":"equity","investedMinor":15000000,"valueMinor":18850000,"expenseRatioBps":180,"regularPlan":true}'
hold '{"name":"Gold ETF","kind":"gold","investedMinor":8500000,"valueMinor":9640000,"expenseRatioBps":50}'
hold '{"name":"Liquid Debt Fund","kind":"debt","investedMinor":12000000,"valueMinor":12680000,"expenseRatioBps":25}'

say "net worth"
nw() { curl -sf -X POST "$B/api/v0/networth" "${H[@]}" -H "Content-Type: application/json" -d "$1" >/dev/null; }
nw '{"itemType":"asset","name":"Nifty 50 Index Fund","amountMinor":32200000,"incomeGenerating":true}'
nw '{"itemType":"asset","name":"Flexi-cap Fund","amountMinor":18850000,"incomeGenerating":true}'
nw '{"itemType":"asset","name":"Gold ETF","amountMinor":9640000,"incomeGenerating":false,"note":"Store of value"}'
nw '{"itemType":"asset","name":"Emergency fund","amountMinor":15000000,"incomeGenerating":false,"note":"Liquid safety net"}'
nw '{"itemType":"asset","name":"Bank balance","amountMinor":4200000}'
nw '{"itemType":"liability","name":"Credit card outstanding","amountMinor":1840000}'
nw '{"itemType":"liability","name":"Personal loan","amountMinor":12000000}'
nw '{"itemType":"liability","name":"Phone EMI","amountMinor":1500000}'

say "goals"
goal() { curl -sf -X POST "$B/api/v0/goals" "${H[@]}" -H "Content-Type: application/json" -d "$1" >/dev/null; }
goal '{"name":"Emergency Fund","icon":"shield","targetMinor":30000000,"currentMinor":15000000}'
goal '{"name":"Goa Trip","icon":"palmtree","targetMinor":6000000,"currentMinor":2400000}'
goal '{"name":"New Laptop","icon":"laptop","targetMinor":9000000,"currentMinor":3000000}'

say "viewer membership (Rohan, read-only) — exercise via DB-free API later"
# (member management endpoint lands in a later sweep; viewer membership is
#  seeded by the identity tests / ops for now.)

say "DONE — budget snapshot:"
curl -sf "$B/api/v0/budget?period=2026-06" "${H[@]}"; echo
