/**
 * Gen-Z slang → real finance concept, with a plain meaning. Every term decodes
 * to something that actually exists in Money Tracker, so the slang is fun but
 * never a dead meme. Powers the Glossary screen + inline slang tooltips.
 */
export interface GlossaryEntry {
  term: string;
  mapsTo: string; // the real app concept
  meaning: string;
}

export const glossary: GlossaryEntry[] = [
  { term: "it's giving Unallocated", mapsTo: "Unallocated envelope", meaning: "Money that's landed but you haven't budgeted into a named envelope yet." },
  { term: "secured the bag", mapsTo: "Income posted", meaning: "Income arrived and was recorded — it lands in Unallocated first." },
  { term: "envelope is cooked", mapsTo: "Envelope at ₹0", meaning: "This envelope is empty — nothing left to spend here this period." },
  { term: "no cap balance", mapsTo: "Derived balance", meaning: "The number is real — computed from every entry, not a vibe you typed in." },
  { term: "the budget said no", mapsTo: "Never-negative invariant", meaning: "A spend that would overdraw an envelope is blocked before it happens." },
  { term: "caught in 4K", mapsTo: "Overspend → Unallocated", meaning: "We caught the overdraw and rerouted the spend to Unallocated instead of breaking the budget." },
  { term: "this category is giving broke", mapsTo: "Depleted envelope", meaning: "This envelope is running near empty for the period." },
  { term: "glow-up szn", mapsTo: "Savings goal progressing", meaning: "A goal envelope is funding up nicely over time." },
  { term: "rizz up your savings", mapsTo: "Allocate to a goal", meaning: "Move income into a savings/goal envelope to grow it." },
  { term: "delulu budget", mapsTo: "Over-allocated plan", meaning: "A plan that doesn't match reality yet — growing Unallocated is the receipt." },
  { term: "main character spending", mapsTo: "High discretionary spend", meaning: "A big chunk going to lifestyle/fun categories this period." },
  { term: "the ick", mapsTo: "Attempted overdraw (blocked)", meaning: "That spend tried to push an envelope negative — hard no." },
  { term: "money glow-up", mapsTo: "Positive rollover", meaning: "You under-spent and leftover money carried into next month." },
  { term: "leftovers rolled over", mapsTo: "Rollover", meaning: "Unspent envelope money carries into next month automatically." },
  { term: "don't double dip", mapsTo: "Dedup on re-upload", meaning: "Re-uploaded an overlapping statement — duplicates are silently dropped." },
  { term: "upload the receipts", mapsTo: "Statement upload", meaning: "Drop your bank CSV; we parse, normalize, and sort every transaction." },
  { term: "math is mathing", mapsTo: "Double-entry conservation", meaning: "Every movement balances to zero — money only moves, never appears or vanishes." },
  { term: "split the bag", mapsTo: "Allocate outward", meaning: "Divide income from Unallocated into your named envelopes." },
  { term: "plan said stop", mapsTo: "Constraint, not a report", meaning: "A budget that actually stops you, not one that just reports the damage later." },
  { term: "reality outran the plan", mapsTo: "Growing Unallocated", meaning: "More slipped past your envelopes than planned — re-budget to reconcile." },
];
