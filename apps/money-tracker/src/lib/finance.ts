/**
 * Pure investment math for the calculators. Works in whole rupees (not paise —
 * these are projections, not ledger entries). Standard Indian SIP conventions:
 * monthly compounding, contributions at the start of each month.
 */

export interface ProjectionPoint {
  month: number;
  invested: number; // cumulative contributed
  value: number; // portfolio value
}

/**
 * Month-by-month SIP projection. Supports an annual step-up (raise the monthly
 * contribution by `stepUpPct` each year — the "increase my SIP yearly" toggle).
 */
export function sipProjection(monthly: number, annualReturnPct: number, years: number, stepUpPct = 0): ProjectionPoint[] {
  const i = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  const out: ProjectionPoint[] = [{ month: 0, invested: 0, value: 0 }];
  let value = 0;
  let invested = 0;
  let contribution = monthly;
  for (let m = 1; m <= n; m++) {
    // contribution at start of month, then grows for the month
    value = (value + contribution) * (1 + i);
    invested += contribution;
    out.push({ month: m, invested: Math.round(invested), value: Math.round(value) });
    if (m % 12 === 0 && stepUpPct > 0) contribution = contribution * (1 + stepUpPct / 100);
  }
  return out;
}

/** Lump-sum projection (one-time investment, annual compounding shown monthly). */
export function lumpsumProjection(principal: number, annualReturnPct: number, years: number): ProjectionPoint[] {
  const i = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  const out: ProjectionPoint[] = [];
  for (let m = 0; m <= n; m++) {
    out.push({ month: m, invested: Math.round(principal), value: Math.round(principal * Math.pow(1 + i, m)) });
  }
  return out;
}

export interface SipResult {
  futureValue: number;
  invested: number;
  gains: number;
  series: ProjectionPoint[];
}

export function sipResult(monthly: number, annualReturnPct: number, years: number, stepUpPct = 0): SipResult {
  const series = sipProjection(monthly, annualReturnPct, years, stepUpPct);
  // sipProjection always seeds out[] with the month-0 point, so last is defined.
  const last = series[series.length - 1] ?? { month: 0, invested: 0, value: 0 };
  return { futureValue: last.value, invested: last.invested, gains: last.value - last.invested, series };
}

export function lumpsumResult(principal: number, annualReturnPct: number, years: number): SipResult {
  const series = lumpsumProjection(principal, annualReturnPct, years);
  // lumpsumProjection always pushes at least the month-0 point, so last is defined.
  const last = series[series.length - 1] ?? { month: 0, invested: 0, value: 0 };
  return { futureValue: last.value, invested: last.invested, gains: last.value - last.invested, series };
}

/** Reverse calc: monthly SIP needed to reach `target` in `years` at a given return. */
export function requiredMonthlyForGoal(target: number, annualReturnPct: number, years: number): number {
  const i = annualReturnPct / 100 / 12;
  const n = Math.round(years * 12);
  if (n <= 0) return target;
  if (i === 0) return target / n;
  const P = (target * i) / ((Math.pow(1 + i, n) - 1) * (1 + i));
  return Math.round(P);
}

/* ── Runway / emergency-fund math ──────────────────────────────────────────
 * "If income stopped today, how long do my liquid savings cover living costs?"
 * Month-by-month drawdown: optionally the parked balance still earns interest
 * (savings account / liquid fund) and expenses optionally creep with inflation.
 */

export interface RunwayPoint {
  month: number;
  balance: number; // remaining liquid savings, clamped at 0
}

export interface RunwayResult {
  /** Fractional months the savings last; capped at maxMonths. */
  months: number;
  /** True when the balance never depletes within maxMonths (income ≥ outflow). */
  indefinite: boolean;
  series: RunwayPoint[];
  /** Net monthly outflow at the start (expenses − income). */
  monthlyNetBurn: number;
}

export function runwayProjection({
  savings,
  monthlyExpenses,
  monthlyIncome = 0,
  annualReturnPct = 0,
  annualInflationPct = 0,
  maxMonths = 600,
}: {
  savings: number;
  monthlyExpenses: number;
  monthlyIncome?: number;
  annualReturnPct?: number;
  annualInflationPct?: number;
  maxMonths?: number;
}): RunwayResult {
  const ri = annualReturnPct / 100 / 12;
  let balance = savings;
  let expense = monthlyExpenses;
  const series: RunwayPoint[] = [{ month: 0, balance: Math.round(balance) }];
  let months = maxMonths;
  let indefinite = true;

  for (let m = 1; m <= maxMonths; m++) {
    const afterInterest = balance * (1 + ri);
    const net = expense - monthlyIncome; // money leaving the pot this month
    const end = afterInterest - net;
    if (end <= 0) {
      // depletes partway through this month — interpolate the fraction
      months = net > 0 ? m - 1 + afterInterest / net : m;
      series.push({ month: m, balance: 0 });
      indefinite = false;
      break;
    }
    balance = end;
    series.push({ month: m, balance: Math.round(balance) });
    if (m % 12 === 0) expense = expense * (1 + annualInflationPct / 100);
  }

  return { months, indefinite, series, monthlyNetBurn: monthlyExpenses - monthlyIncome };
}

export interface BuildupResult {
  /** Months to reach the target fund; capped at maxMonths. */
  months: number;
  /** True if the target is already met or gets met within maxMonths. */
  reached: boolean;
  series: RunwayPoint[];
}

/**
 * Reverse of the runway: building an emergency fund up to `targetFund` by
 * setting aside `monthlySetAside` each month (the parked balance optionally
 * earns interest while it grows). Used by the contingency-planner mode.
 */
export function buildupProjection({
  savings,
  monthlySetAside,
  targetFund,
  annualReturnPct = 0,
  maxMonths = 600,
}: {
  savings: number;
  monthlySetAside: number;
  targetFund: number;
  annualReturnPct?: number;
  maxMonths?: number;
}): BuildupResult {
  const ri = annualReturnPct / 100 / 12;
  let balance = savings;
  const series: RunwayPoint[] = [{ month: 0, balance: Math.round(balance) }];
  if (balance >= targetFund) return { months: 0, reached: true, series };

  let months = maxMonths;
  let reached = false;
  for (let m = 1; m <= maxMonths; m++) {
    balance = balance * (1 + ri) + monthlySetAside;
    series.push({ month: m, balance: Math.round(balance) });
    if (balance >= targetFund) {
      months = m;
      reached = true;
      break;
    }
  }
  return { months, reached, series };
}

/** Months → "1 yr 4 mo" / "8 mo" / "2 yr" / "50+ yrs". */
export function formatMonths(months: number): string {
  if (months >= 600) return "50+ yrs";
  const whole = Math.max(0, Math.round(months));
  const y = Math.floor(whole / 12);
  const mo = whole % 12;
  if (y <= 0) return `${mo} mo`;
  if (mo === 0) return `${y} yr`;
  return `${y} yr ${mo} mo`;
}

/** Indian-grouped rupee formatting, e.g. ₹12,34,567. */
export function inr(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

/** Compact rupee, e.g. ₹12.3L / ₹1.2Cr — for axis labels. */
export function inrCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(0)}k`;
  return `₹${Math.round(n)}`;
}
