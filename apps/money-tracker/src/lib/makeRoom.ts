/**
 * "Make Room" planner — the math behind covering an unplanned expense out of an
 * already-allocated (zero-based) envelope budget. Pure functions; the UI is a
 * read-only simulator over these until the user hits Apply (which would fire the
 * real never-negative atomic transfers).
 *
 * Core concept: BREATHING ROOM. Each envelope can spare only the slack it has
 * left over its expected remaining spend — protected envelopes (rent, EMIs,
 * emergency fund) and goal envelopes spare nothing "for free." Pulling beyond
 * breathing room is a COMMITTED bite that creates a setback you have to recover.
 */

export interface Envelope {
  id: string;
  name: string;
  icon: string; // Icon name (Lucide)
  emoji: string; // Gen Z fallback
  /** Current unspent balance this period. */
  balance: number;
  /** Expected spend still to come this period (the "need" line). */
  expectedRemaining: number;
  /** Rent / EMIs / emergency fund — never pulled "for free." */
  isProtected?: boolean;
  /** Goal-linked envelopes spare no free slack; raiding them delays the goal. */
  goalName?: string;
}

/** Slack an envelope can give up without dipping below its expected spend. */
export function breathingRoom(e: Envelope): number {
  if (e.isProtected || e.goalName) return 0;
  return Math.max(0, e.balance - e.expectedRemaining);
}

export interface Pull {
  id: string;
  name: string;
  icon: string;
  emoji: string;
  goalName?: string;
  balance: number;
  expectedRemaining: number;
  /** Portion taken from slack (painless). */
  fromSlack: number;
  /** Portion taken from committed money (bites the plan). */
  fromCommitted: number;
  /** Balance after the pull. */
  after: number;
}

export interface Setback {
  name: string;
  /** How far below its expected spend this envelope now sits. */
  short: number;
  goalName?: string;
}

export interface MakeRoomPlan {
  expense: number;
  totalBreathing: number;
  /** Whole expense fits inside slack — no real setback. */
  absorbable: boolean;
  /** Could not be covered even by touching all non-protected money. */
  impossible: boolean;
  pulls: Pull[];
  /** Total taken from committed money (the part that hurts). */
  shortfall: number;
  setbacks: Setback[];
  recoveryMonthly: number;
  recoveryMonths: number;
  recoverySource?: string;
}

/** Monthly drip to pre-fund a recurring expense by its next occurrence. */
export function sinkingFundMonthly(expense: number, periodMonths: number): number {
  if (periodMonths <= 0) return expense;
  return Math.ceil(expense / periodMonths);
}

/** Human label for a recurrence period in months. */
export function periodLabel(periodMonths: number): string {
  return periodMonths === 1
    ? "month"
    : periodMonths === 3
      ? "quarter"
      : periodMonths === 6
        ? "6 months"
        : periodMonths === 12
          ? "year"
          : `${periodMonths} months`;
}

const EMPTY: MakeRoomPlan = {
  expense: 0,
  totalBreathing: 0,
  absorbable: true,
  impossible: false,
  pulls: [],
  shortfall: 0,
  setbacks: [],
  recoveryMonthly: 0,
  recoveryMonths: 0,
};

export function planMakeRoom(expense: number, envelopes: Envelope[]): MakeRoomPlan {
  const totalBreathing = envelopes.reduce((s, e) => s + breathingRoom(e), 0);
  if (expense <= 0) return { ...EMPTY, totalBreathing };

  const work = envelopes.map((e) => ({ e, slack: 0, committed: 0 }));
  let remaining = expense;

  // Pass 1 — spend the slack, deepest breathing room first (least painful).
  for (const w of [...work].sort((a, b) => breathingRoom(b.e) - breathingRoom(a.e))) {
    if (remaining <= 0) break;
    const room = breathingRoom(w.e);
    if (room <= 0) continue;
    const take = Math.min(room, remaining);
    w.slack = take;
    remaining -= take;
  }

  // Pass 2 — bite committed money. Discretionary first (no goal), goals last.
  if (remaining > 0) {
    const committable = work.filter((w) => !w.e.isProtected);
    const order = committable.sort((a, b) => {
      const ag = a.e.goalName ? 1 : 0;
      const bg = b.e.goalName ? 1 : 0;
      if (ag !== bg) return ag - bg; // non-goal (0) before goal (1)
      return b.e.balance - b.slack - (a.e.balance - a.slack);
    });
    for (const w of order) {
      if (remaining <= 0) break;
      const avail = w.e.balance - w.slack;
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      w.committed = take;
      remaining -= take;
    }
  }

  const impossible = remaining > 0.5; // even all non-protected money can't cover it

  const pulls: Pull[] = work
    .filter((w) => w.slack + w.committed > 0)
    .map((w) => ({
      id: w.e.id,
      name: w.e.name,
      icon: w.e.icon,
      emoji: w.e.emoji,
      goalName: w.e.goalName,
      balance: w.e.balance,
      expectedRemaining: w.e.expectedRemaining,
      fromSlack: Math.round(w.slack),
      fromCommitted: Math.round(w.committed),
      after: Math.round(w.e.balance - w.slack - w.committed),
    }))
    // biggest contributors first
    .sort((a, b) => b.fromSlack + b.fromCommitted - (a.fromSlack + a.fromCommitted));

  const setbacks: Setback[] = work
    .filter((w) => w.committed > 0)
    .map((w) => ({
      name: w.e.name,
      short: Math.round(Math.max(0, w.e.expectedRemaining - (w.e.balance - w.slack - w.committed))),
      goalName: w.e.goalName,
    }))
    .filter((s) => s.short > 0 || s.goalName);

  const shortfall = Math.round(work.reduce((s, w) => s + w.committed, 0));

  // Recovery: refill the committed bite over ~3 months, trimming the most
  // discretionary envelope (highest expected spend, no goal, not protected).
  let recoveryMonthly = 0;
  let recoveryMonths = 0;
  let recoverySource: string | undefined;
  if (shortfall > 0) {
    recoveryMonths = 3;
    recoveryMonthly = Math.ceil(shortfall / recoveryMonths);
    const trimmable = [...envelopes]
      .filter((e) => !e.isProtected && !e.goalName)
      .sort((a, b) => b.expectedRemaining - a.expectedRemaining)[0];
    recoverySource = trimmable?.name;
  }

  return {
    expense,
    totalBreathing,
    absorbable: shortfall === 0 && !impossible,
    impossible,
    pulls,
    shortfall,
    setbacks,
    recoveryMonthly,
    recoveryMonths,
    recoverySource,
  };
}
