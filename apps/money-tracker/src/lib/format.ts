/**
 * Money formatting for the live app. Backend money is integer PAISE (minor);
 * the UI shows rupees with Indian digit grouping. These mirror the package's
 * `formatMoney` but take a raw minor integer (the live API returns
 * `{ minor, currency }` or bare minor ints depending on the endpoint).
 */

/** ₹1,49,500 paise → "₹1,495" (Indian grouping, no decimals — clean for the app). */
export function formatINR(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const rupees = Math.round(Math.abs(minor) / 100);
  return `${sign}₹${rupees.toLocaleString("en-IN")}`;
}

/** ₹1,49,512 paise → "₹1,495.12" — when paise precision matters (rare in v0). */
export function formatINRPrecise(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}₹${whole.toLocaleString("en-IN")}.${frac}`;
}

/** Rupees (number, possibly fractional from a form input) → integer paise. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** "12.3%" style helper for the few percentage chips we render. */
export function formatPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}
