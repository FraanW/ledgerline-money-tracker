import type { ComponentType } from "react";
import copy from "../../data/lensCopy.json";

// ── lens components (the live, interactive views) ───────────────────────────
import { SnowballCoach } from "../../components/lens/authors/SnowballCoach";
import { ConsciousSpendingPlan } from "../../components/lens/authors/ConsciousSpendingPlan";
import { CostDragProjector } from "../../components/lens/authors/CostDragProjector";
import { AccumulatorScore } from "../../components/lens/authors/AccumulatorScore";
import { HoursOfLife } from "../../components/lens/authors/HoursOfLife";
import { PayYourselfFirst } from "../../components/lens/authors/PayYourselfFirst";
import { LatteFactorFinder } from "../../components/lens/authors/LatteFactorFinder";
import { TimeBuckets } from "../../components/lens/authors/TimeBuckets";
import { FungibilitySweep } from "../../components/lens/behavioral/FungibilitySweep";
import { ReferenceFramedBudget } from "../../components/lens/behavioral/ReferenceFramedBudget";
import { FutureSelfLock } from "../../components/lens/behavioral/FutureSelfLock";
import { SubscriptionLeakDetector } from "../../components/lens/behavioral/SubscriptionLeakDetector";
import { RaiseCatcher } from "../../components/lens/behavioral/RaiseCatcher";
import { PainRestorer } from "../../components/lens/behavioral/PainRestorer";
import { FreeTrapTracker } from "../../components/lens/behavioral/FreeTrapTracker";
import { AnchorReset } from "../../components/lens/behavioral/AnchorReset";
import { FiftyThirtyTwentyBands } from "../../components/lens/methods/FiftyThirtyTwentyBands";
import { ToBeAssigned } from "../../components/lens/methods/ToBeAssigned";
import { YearsToFi } from "../../components/lens/methods/YearsToFi";
import { CashStackEnvelopes } from "../../components/lens/methods/CashStackEnvelopes";
import { KakeiboReflection } from "../../components/lens/methods/KakeiboReflection";
import { ThirtyDayList } from "../../components/lens/methods/ThirtyDayList";
import { BalanceSheet } from "../../components/networth/BalanceSheet";
import { CompoundingLesson } from "../../components/calculators/CompoundingLesson";
import { RunwayCalculator } from "../../components/calculators/RunwayCalculator";
import { MakeRoom } from "../../components/makeroom/MakeRoom";

export type LensGroup = "Canon Authors" | "Behavioral Science" | "Operational Methods";
export const GROUPS: LensGroup[] = ["Canon Authors", "Behavioral Science", "Operational Methods"];

export interface LensEntry {
  slug: string;
  title: string;
  author: string;
  group: LensGroup;
  oneLiner: string;
  whatItIs: string;
  whyItMatters: string;
  howToRead: string;
  Component: ComponentType;
}

interface Seed {
  slug: string;
  title: string;
  author: string;
  group: LensGroup;
  Component: ComponentType;
}

const SEED: Seed[] = [
  // ── Canon Authors ──
  { slug: "snowball-coach", title: "Snowball Coach", author: "Dave Ramsey", group: "Canon Authors", Component: SnowballCoach },
  { slug: "conscious-spending", title: "Conscious Spending Plan", author: "Ramit Sethi", group: "Canon Authors", Component: ConsciousSpendingPlan },
  { slug: "cost-drag", title: "Cost Drag Projector", author: "John Bogle", group: "Canon Authors", Component: CostDragProjector },
  { slug: "accumulator-score", title: "Accumulator Score", author: "The Millionaire Next Door", group: "Canon Authors", Component: AccumulatorScore },
  { slug: "hours-of-life", title: "Hours of Life", author: "Your Money or Your Life", group: "Canon Authors", Component: HoursOfLife },
  { slug: "pay-yourself-first", title: "Pay Yourself First", author: "Clason & Bach", group: "Canon Authors", Component: PayYourselfFirst },
  { slug: "latte-factor", title: "Latte Factor Finder", author: "David Bach", group: "Canon Authors", Component: LatteFactorFinder },
  { slug: "time-buckets", title: "Time Buckets", author: "Die With Zero", group: "Canon Authors", Component: TimeBuckets },
  { slug: "balance-sheet", title: "Assets vs Liabilities", author: "Robert Kiyosaki", group: "Canon Authors", Component: BalanceSheet },
  { slug: "compounding", title: "The Compounding Lesson", author: "Morgan Housel", group: "Canon Authors", Component: CompoundingLesson },
  // ── Behavioral Science ──
  { slug: "fungibility-sweep", title: "Fungibility Sweep", author: "Thaler — Mental Accounting", group: "Behavioral Science", Component: FungibilitySweep },
  { slug: "reference-framed-budget", title: "Reference-Framed Budget", author: "Kahneman & Tversky", group: "Behavioral Science", Component: ReferenceFramedBudget },
  { slug: "future-self-lock", title: "Future-Self Commitment Lock", author: "Laibson — Present Bias", group: "Behavioral Science", Component: FutureSelfLock },
  { slug: "subscription-leak", title: "Subscription Leak Detector", author: "The Endowment Effect", group: "Behavioral Science", Component: SubscriptionLeakDetector },
  { slug: "raise-catcher", title: "Raise Catcher", author: "Save More Tomorrow", group: "Behavioral Science", Component: RaiseCatcher },
  { slug: "pain-restorer", title: "Pain Restorer", author: "Prelec & Loewenstein", group: "Behavioral Science", Component: PainRestorer },
  { slug: "free-trap", title: "Free-Trap Tracker", author: "Ariely — Zero-Price Effect", group: "Behavioral Science", Component: FreeTrapTracker },
  { slug: "anchor-reset", title: "Anchor Reset", author: "Anchoring", group: "Behavioral Science", Component: AnchorReset },
  // ── Operational Methods ──
  { slug: "fifty-thirty-twenty", title: "50 / 30 / 20", author: "Elizabeth Warren", group: "Operational Methods", Component: FiftyThirtyTwentyBands },
  { slug: "to-be-assigned", title: "To Be Assigned", author: "YNAB · Jesse Mecham", group: "Operational Methods", Component: ToBeAssigned },
  { slug: "years-to-fi", title: "Years to Freedom", author: "FIRE · the 4% rule", group: "Operational Methods", Component: YearsToFi },
  { slug: "cash-stack", title: "Cash-Stack Envelopes", author: "The Envelope Method", group: "Operational Methods", Component: CashStackEnvelopes },
  { slug: "kakeibo", title: "Kakeibo Reflection", author: "Hani Motoko, 1904", group: "Operational Methods", Component: KakeiboReflection },
  { slug: "thirty-day", title: "The 30-Day List", author: "The Cooling-Off Rule", group: "Operational Methods", Component: ThirtyDayList },
  { slug: "runway", title: "Runway & Safety Net", author: "Emergency-Fund Planning", group: "Operational Methods", Component: RunwayCalculator },
  { slug: "make-room", title: "Make Room", author: "YNAB Rules 2 & 3", group: "Operational Methods", Component: MakeRoom },
];

type Copy = { slug: string; oneLiner: string; whatItIs: string; whyItMatters: string; howToRead: string };
const copyMap = new Map((copy as Copy[]).map((c) => [c.slug, c]));

export const LENSES: LensEntry[] = SEED.map((s) => {
  const c = copyMap.get(s.slug);
  return {
    ...s,
    oneLiner: c?.oneLiner ?? "",
    whatItIs: c?.whatItIs ?? "",
    whyItMatters: c?.whyItMatters ?? "",
    howToRead: c?.howToRead ?? "",
  };
});

export const getLens = (slug: string): LensEntry | undefined => LENSES.find((l) => l.slug === slug);
export const lensesInGroup = (g: LensGroup): LensEntry[] => LENSES.filter((l) => l.group === g);
