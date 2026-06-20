/**
 * Personal balance sheet data (rupees) for the Net Worth view.
 *
 * Framed through the Rich Dad Poor Dad lens: an ASSET puts money in your
 * pocket; a LIABILITY takes money out. We additionally flag which assets are
 * genuinely *income-generating* (Kiyosaki's strict definition) vs. merely
 * stores of value — so the UI can show the honest distinction, not just totals.
 */
export interface BalanceItem {
  id: string;
  name: string;
  amountRupees: number;
  /** Assets only: does it put money in your pocket (appreciates/yields)? */
  incomeGenerating?: boolean;
  note?: string;
}

export const assets: BalanceItem[] = [
  { id: "a1", name: "Nifty 50 Index Fund", amountRupees: 322000, incomeGenerating: true, note: "Appreciates + dividends" },
  { id: "a2", name: "Flexi-cap Mutual Fund", amountRupees: 188500, incomeGenerating: true, note: "Long-term growth" },
  { id: "a3", name: "Gold ETF", amountRupees: 96400, incomeGenerating: false, note: "Store of value" },
  { id: "a4", name: "Emergency fund", amountRupees: 150000, incomeGenerating: false, note: "Liquid safety net" },
  { id: "a5", name: "Bank balance", amountRupees: 42000, incomeGenerating: false, note: "Spending money" },
];

export const liabilities: BalanceItem[] = [
  { id: "l1", name: "Credit card outstanding", amountRupees: 18400, note: "Pay in full to avoid ~42% APR" },
  { id: "l2", name: "Personal loan", amountRupees: 120000, note: "EMI ₹4,200/mo" },
  { id: "l3", name: "Phone EMI", amountRupees: 15000, note: "A liability that felt like an asset" },
];

export const assetsTotal = assets.reduce((s, a) => s + a.amountRupees, 0);
export const liabilitiesTotal = liabilities.reduce((s, l) => s + l.amountRupees, 0);
export const netWorth = assetsTotal - liabilitiesTotal;
export const incomeGeneratingTotal = assets.filter((a) => a.incomeGenerating).reduce((s, a) => s + a.amountRupees, 0);
