/** Mock categorization rules for the Tag Workshop (maps to M11 categorization_rules). */
export type RulePatternKind = "contains" | "equals" | "regex";

export interface MockRule {
  id: string;
  patternKind: RulePatternKind;
  pattern: string;
  categoryName: string;
  priority: number;
  enabled: boolean;
}

export const mockRules: MockRule[] = [
  { id: "r1", patternKind: "contains", pattern: "BIGBAZAAR", categoryName: "Groceries", priority: 10, enabled: true },
  { id: "r2", patternKind: "contains", pattern: "DMART", categoryName: "Groceries", priority: 10, enabled: true },
  { id: "r3", patternKind: "contains", pattern: "SWIGGY", categoryName: "Dining", priority: 20, enabled: true },
  { id: "r4", patternKind: "contains", pattern: "ZOMATO", categoryName: "Dining", priority: 20, enabled: true },
  { id: "r5", patternKind: "contains", pattern: "UBER", categoryName: "Transport", priority: 30, enabled: true },
  { id: "r6", patternKind: "contains", pattern: "NETFLIX", categoryName: "Fun", priority: 40, enabled: true },
  { id: "r7", patternKind: "regex", pattern: "^IMPS RENT.*", categoryName: "Rent", priority: 5, enabled: true },
  { id: "r8", patternKind: "contains", pattern: "HPCL", categoryName: "Transport", priority: 30, enabled: false },
];

/** A few raw descriptions to preview how rules would tag them. */
export const previewDescriptions = [
  "UPI/BIGBAZAAR/groceries",
  "SWIGGY ORDER 88213",
  "AMZ*MKTP IN 4QX",
  "IMPS RENT TRANSFER LANDLORD",
  "PHARMEASY ORDER",
];
