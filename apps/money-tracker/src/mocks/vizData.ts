import { transactions, categories, userEnvelopes, unallocated, CURRENT_PERIOD } from "./fixtures";

/**
 * Derived datasets for the creative data-viz components — all computed from the
 * same typed fixtures, no new source of truth.
 */

const catName = (id: string | null) =>
  id === null ? "Unallocated" : categories.find((c) => c.id === id)?.name ?? id;

/** Spend (debits) by category in the current period, paise. */
export interface VizSlice {
  key: string;
  label: string;
  amountMinor: number;
  /** which envelope this maps to, for ring/flow pairing (best-effort by name) */
  envelopeId?: string;
}

export const spendSlices: VizSlice[] = (() => {
  const m = new Map<string | null, number>();
  for (const t of transactions) {
    if (!t.postedAt.startsWith(CURRENT_PERIOD) || t.direction !== "debit") continue;
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount.minor);
  }
  return [...m.entries()]
    .map(([id, minor]) => ({
      key: id ?? "unallocated",
      label: catName(id),
      amountMinor: minor,
      envelopeId: userEnvelopes.find((e) => e.name === catName(id))?.id,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
})();

/** Per-envelope allocated vs spent, for the budget rings. */
export interface RingDatum {
  id: string;
  label: string;
  allocatedMinor: number;
  spentMinor: number;
}

export const ringData: RingDatum[] = userEnvelopes
  .filter((e) => e.name !== "Savings goal")
  .map((e) => {
    const spent = spendSlices.find((s) => s.label === e.name)?.amountMinor ?? 0;
    // allocated ≈ current balance + spent (what was put in before spending)
    return { id: e.id, label: e.name, allocatedMinor: e.balance.minor + spent, spentMinor: spent };
  });

/** Income -> envelopes -> spent/unallocated, for the Sankey-lite money flow. */
export interface FlowNode {
  id: string;
  label: string;
  amountMinor: number;
  kind: "income" | "envelope" | "sink";
}
export interface FlowLink {
  fromId: string;
  toId: string;
  amountMinor: number;
}

export const flow = (() => {
  const incomeMinor = transactions
    .filter((t) => t.postedAt.startsWith(CURRENT_PERIOD) && t.direction === "credit")
    .reduce((s, t) => s + t.amount.minor, 0);

  const envNodes: FlowNode[] = ringData.map((r) => ({
    id: r.id,
    label: r.label,
    amountMinor: r.allocatedMinor,
    kind: "envelope" as const,
  }));

  const nodes: FlowNode[] = [
    { id: "income", label: "Income", amountMinor: incomeMinor, kind: "income" },
    ...envNodes,
    { id: "spent", label: "Spent", amountMinor: ringData.reduce((s, r) => s + r.spentMinor, 0), kind: "sink" },
    { id: "unallocated", label: "Unallocated", amountMinor: unallocated.balance.minor, kind: "sink" },
  ];

  const links: FlowLink[] = [
    ...envNodes.map((n) => ({ fromId: "income", toId: n.id, amountMinor: n.amountMinor })),
    { fromId: "income", toId: "unallocated", amountMinor: unallocated.balance.minor },
    ...ringData
      .filter((r) => r.spentMinor > 0)
      .map((r) => ({ fromId: r.id, toId: "spent", amountMinor: r.spentMinor })),
  ];

  return { nodes, links };
})();

/** Daily spend for the current period, for the calendar heatmap. */
export interface DayCell {
  date: string; // YYYY-MM-DD
  day: number;
  amountMinor: number;
}

export const dailySpend: DayCell[] = (() => {
  const [y = 0, mo = 0] = CURRENT_PERIOD.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const byDay = new Map<number, number>();
  for (const t of transactions) {
    if (!t.postedAt.startsWith(CURRENT_PERIOD) || t.direction !== "debit") continue;
    const d = Number(t.postedAt.slice(8, 10));
    byDay.set(d, (byDay.get(d) ?? 0) + t.amount.minor);
  }
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      date: `${CURRENT_PERIOD}-${String(day).padStart(2, "0")}`,
      day,
      amountMinor: byDay.get(day) ?? 0,
    };
  });
})();

/** Weekday index (0=Mon) of the 1st of the period, for heatmap grid offset. */
export const firstWeekdayMonday0 = (() => {
  const [y = 0, mo = 0] = CURRENT_PERIOD.split("-").map(Number);
  const js = new Date(y, mo - 1, 1).getDay(); // 0=Sun
  return (js + 6) % 7; // 0=Mon
})();

/** Running account balance across May+June, for the trend area chart. */
export interface BalancePoint {
  date: string;
  balanceMinor: number;
}

export const balanceSeries: BalancePoint[] = (() => {
  const OPENING = 3_500_000; // ₹35,000 opening balance (mock)
  const sorted = [...transactions].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  let bal = OPENING;
  const byDate = new Map<string, number>();
  for (const t of sorted) {
    bal += t.direction === "credit" ? t.amount.minor : -t.amount.minor;
    byDate.set(t.postedAt, bal); // last value wins for a given day
  }
  return [...byDate.entries()].map(([date, balanceMinor]) => ({ date, balanceMinor }));
})();

/** Income minus each category, ending at leftover — for the cashflow waterfall. */
export interface WaterfallStep {
  label: string;
  deltaMinor: number; // +income, -spend
  kind: "income" | "spend" | "total";
}

export const waterfall: WaterfallStep[] = (() => {
  const income = transactions
    .filter((t) => t.postedAt.startsWith(CURRENT_PERIOD) && t.direction === "credit")
    .reduce((s, t) => s + t.amount.minor, 0);
  const steps: WaterfallStep[] = [{ label: "Income", deltaMinor: income, kind: "income" }];
  for (const s of spendSlices) steps.push({ label: s.label, deltaMinor: -s.amountMinor, kind: "spend" });
  const leftover = steps.reduce((sum, s) => sum + s.deltaMinor, 0);
  steps.push({ label: "Leftover", deltaMinor: leftover, kind: "total" });
  return steps;
})();

/** Cumulative spend per category across the month's days — for the stacked stream. */
export interface StreamSeries {
  key: string;
  label: string;
  points: number[]; // cumulative paise, one per day
}

export const streamDays = dailySpend.length;
export const streamSeries: StreamSeries[] = (() => {
  const cats = spendSlices.map((s) => ({ key: s.key, label: s.label }));
  const daily = new Map<string, number[]>();
  cats.forEach((c) => daily.set(c.key, new Array(streamDays).fill(0)));
  for (const t of transactions) {
    if (!t.postedAt.startsWith(CURRENT_PERIOD) || t.direction !== "debit") continue;
    const key = t.categoryId ?? "unallocated";
    const d = Number(t.postedAt.slice(8, 10)) - 1;
    const arr = daily.get(key);
    if (arr && d >= 0 && d < streamDays) arr[d] = (arr[d] ?? 0) + t.amount.minor;
  }
  return cats.map((c) => {
    const d = daily.get(c.key)!;
    let run = 0;
    return { key: c.key, label: c.label, points: d.map((v) => (run += v)) };
  });
})();

/** A 0–100 "vibe check" budget-health score with an explainable breakdown. */
export interface VibeFactor {
  label: string;
  points: number; // contribution to the score
  detail: string;
}

export const vibeScore = (() => {
  const income = transactions
    .filter((t) => t.postedAt.startsWith(CURRENT_PERIOD) && t.direction === "credit")
    .reduce((s, t) => s + t.amount.minor, 0);

  const onTrack = ringData.filter((r) => r.spentMinor <= r.allocatedMinor).length;
  const onTrackPts = Math.round((onTrack / Math.max(1, ringData.length)) * 50); // up to 50

  const unallocRatio = income > 0 ? unallocated.balance.minor / income : 0;
  const unallocPts = Math.round((1 - Math.min(1, unallocRatio / 0.3)) * 30); // up to 30

  const savings = userEnvelopes.find((e) => e.name === "Savings goal");
  const savingsPts = savings && savings.balance.minor > 0 ? 20 : 0; // 20

  const score = Math.max(0, Math.min(100, onTrackPts + unallocPts + savingsPts));
  const factors: VibeFactor[] = [
    { label: "Envelopes on track", points: onTrackPts, detail: `${onTrack} of ${ringData.length} envelopes stayed within budget (+${onTrackPts})` },
    { label: "Unallocated kept low", points: unallocPts, detail: `${Math.round(unallocRatio * 100)}% of income escaped the plan (+${unallocPts})` },
    { label: "Saving toward a goal", points: savingsPts, detail: savingsPts ? "Savings envelope is funded (+20)" : "No savings funded this month (+0)" },
  ];
  const label = score >= 80 ? "On fire 🔥" : score >= 60 ? "Solid 💪" : score >= 40 ? "Wobbly 😬" : "Needs love 🩹";
  const anyOverspent = ringData.some((r) => r.spentMinor > r.allocatedMinor);
  const bucket: "onTrack" | "savingWell" | "unallocatedGrowing" | "overspent" = anyOverspent
    ? "overspent"
    : unallocRatio > 0.1
      ? "unallocatedGrowing"
      : savingsPts > 0
        ? "savingWell"
        : "onTrack";
  return { score, label, factors, bucket };
})();
