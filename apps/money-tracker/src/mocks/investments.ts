import type { VizSlice } from "./vizData";

/** Mock investment holdings (rupees). In v1 these would come via the AA (mutual
 *  funds, equities, etc. are AA FI types). Today: a believable portfolio. */
export interface Holding {
  id: string;
  name: string;
  kind: "Equity" | "Index" | "Debt" | "Gold";
  investedRupees: number;
  valueRupees: number;
}

export const holdings: Holding[] = [
  { id: "h1", name: "Nifty 50 Index Fund", kind: "Index", investedRupees: 250000, valueRupees: 322000 },
  { id: "h2", name: "Flexi-cap Mutual Fund", kind: "Equity", investedRupees: 150000, valueRupees: 188500 },
  { id: "h3", name: "Gold ETF", kind: "Gold", investedRupees: 85000, valueRupees: 96400 },
  { id: "h4", name: "Liquid / Debt Fund", kind: "Debt", investedRupees: 120000, valueRupees: 126800 },
];

export const portfolioInvested = holdings.reduce((s, h) => s + h.investedRupees, 0);
export const portfolioValue = holdings.reduce((s, h) => s + h.valueRupees, 0);
export const portfolioGains = portfolioValue - portfolioInvested;
export const portfolioReturnPct = Math.round((portfolioGains / portfolioInvested) * 1000) / 10;

/** Allocation by current value, as VizSlice (paise) so the Donut viz can render it. */
export const allocationSlices: VizSlice[] = holdings.map((h) => ({
  key: h.id,
  label: h.name,
  amountMinor: h.valueRupees * 100,
}));
