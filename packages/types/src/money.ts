/**
 * Money is an integer count of minor units (paise for INR).
 *
 * We never represent money as a floating-point number. `0.1 + 0.2 !== 0.3`,
 * and rounding drift in a ledger is unacceptable — every amount is an integer
 * in the smallest currency unit, and all arithmetic is integer arithmetic.
 */
export type CurrencyCode = "INR";

export interface Money {
  /** Integer amount in minor units. 1 INR = 100 paise. May be negative (deltas). */
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export const ZERO_INR: Money = { minor: 0, currency: "INR" };

/** Construct Money from an integer minor-unit amount. Throws on non-integers. */
export function money(minor: number, currency: CurrencyCode = "INR"): Money {
  if (!Number.isInteger(minor)) {
    throw new RangeError(`Money.minor must be an integer, got ${minor}`);
  }
  return { minor, currency };
}

/** Construct Money from a rupee figure, e.g. 149.5 → 14950 paise. */
export function fromRupees(rupees: number, currency: CurrencyCode = "INR"): Money {
  return money(Math.round(rupees * 100), currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

export function negate(a: Money): Money {
  return { minor: -a.minor, currency: a.currency };
}

export function isNegative(a: Money): boolean {
  return a.minor < 0;
}

export function isZero(a: Money): boolean {
  return a.minor === 0;
}

/** Human-readable format, e.g. ₹1,49,500 paise → "₹1,495.00" (Indian digit grouping). */
export function formatMoney(m: Money): string {
  const sign = m.minor < 0 ? "-" : "";
  const abs = Math.abs(m.minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  const symbol = m.currency === "INR" ? "₹" : "";
  return `${sign}${symbol}${whole.toLocaleString("en-IN")}.${frac}`;
}
