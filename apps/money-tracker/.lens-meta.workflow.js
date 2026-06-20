export const meta = {
  name: 'lens-meta',
  description: 'Write faithful, crisp informational copy for each philosophy lens',
  phases: [{ title: 'Write copy', detail: 'one agent per group writes teaching copy for its lenses' }],
};

const BRIEF = `
You are a finance writer for **Money Tracker** (India, INR, UPI/Account-Aggregator era). For each "lens" (a money-philosophy view in the app) write tight, faithful, recruiter-readable TEACHING copy — no hype, no fluff, no em-dash spam. Plain English a smart 25-year-old gets instantly. Indian context (₹, UPI, SIP, salary credits) is welcome where it fits naturally, never forced.

For EACH lens, return these fields:
- oneLiner: <= 12 words, the hook — what this lens reveals about your money.
- whatItIs: exactly 2 sentences — the philosophy, faithfully and plainly. Name the idea.
- whyItMatters: 1-2 sentences — why acting on it actually improves someone's finances.
- howToRead: 1-2 sentences — how to read THIS on-screen view specifically (reference what it shows, given in "shows").

Faithful to the source thinker. Confident, warm, concrete. Return ONLY the structured object with a 'lenses' array; each item MUST include the original slug.
`;

const SCHEMA = {
  type: 'object',
  required: ['lenses'],
  properties: {
    lenses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slug', 'oneLiner', 'whatItIs', 'whyItMatters', 'howToRead'],
        properties: {
          slug: { type: 'string' },
          oneLiner: { type: 'string' },
          whatItIs: { type: 'string' },
          whyItMatters: { type: 'string' },
          howToRead: { type: 'string' },
        },
      },
    },
  },
};

const GROUPS = {
  authors: [
    { slug: "snowball-coach", title: "Snowball Coach", author: "Dave Ramsey", idea: "Clear debts smallest-balance-first for psychological momentum; debt is a behaviour problem, not a math problem.", shows: "An ordered debt list where a snowball grows as each cleared debt frees its minimum into the next; an extra-payment slider shows months-to-debt-free." },
    { slug: "conscious-spending", title: "Conscious Spending Plan", author: "Ramit Sethi", idea: "Spend extravagantly on what you love, cut mercilessly on what you don't; automate four buckets instead of tracking every coffee.", shows: "Four bucket bars (Fixed, Investments, Savings, Guilt-Free) against target ranges, plus Money Dials you star to protect from cuts." },
    { slug: "cost-drag", title: "Cost Drag Projector", author: "John Bogle", idea: "Net return is market return minus costs; fees compound against you, so minimizing them is the one lever you control.", shows: "Two diverging growth curves, with fees versus without; the shaded gap is the lifetime cost, with a years horizon slider." },
    { slug: "accumulator-score", title: "Accumulator Score", author: "Thomas Stanley, The Millionaire Next Door", idea: "Wealth is what you keep, benchmarked to your age and income, not what you earn or display.", shows: "A gauge with Prodigious/Average/Under-Accumulator zones showing your Wealth Index (net worth divided by expected net worth)." },
    { slug: "hours-of-life", title: "Hours of Life", author: "Vicki Robin, Your Money or Your Life", idea: "Money is life energy you traded hours for, so judge purchases in hours of life, not rupees.", shows: "A real-hourly-wage figure derived from sliders, which then re-labels every spending category into the hours of life it cost." },
    { slug: "pay-yourself-first", title: "Pay Yourself First", author: "George Clason & David Bach", idea: "A part of all you earn is yours to keep: route at least 10% to savings the moment income lands, automatically, before spending.", shows: "A months timeline showing each salary-in then the first transfer-out, with a streak counter and savings-rate bars against the 10% line." },
    { slug: "latte-factor", title: "Latte Factor Finder", author: "David Bach", idea: "Trivial recurring small spends quietly compound into a fortune you never built; redirect and automate them.", shows: "A ranked list of small recurring spends, each with its 20-year invested value, that you toggle to see the future-value total climb." },
    { slug: "time-buckets", title: "Time Buckets", author: "Bill Perkins, Die With Zero", idea: "Optimise for net fulfilment over net worth; experiences pay memory dividends, and some are only possible at certain ages.", shows: "A life timeline split into age buckets with experiences you assign, overlaid on your net-worth trajectory." },
  ],
  behavioral: [
    { slug: "fungibility-sweep", title: "Fungibility Sweep", author: "Richard Thaler (mental accounting)", idea: "We file money into non-fungible mental buckets and leave the leftovers idle; a rupee labelled Dining feels unspendable on a goal.", shows: "Idle surplus across envelopes flowing into one chosen goal whose progress ring fills from its current level to the post-sweep level." },
    { slug: "reference-framed-budget", title: "Reference-Framed Budget", author: "Kahneman & Tversky (loss aversion)", idea: "A loss feels about twice as strong as an equal gain, so the reference point you choose decides whether under-budget feels like a win.", shows: "Each envelope framed as you kept an amount or you are over by an amount versus its trailing average, ordered by emotional salience." },
    { slug: "future-self-lock", title: "Future-Self Commitment Lock", author: "David Laibson (present bias)", idea: "We over-weight immediate rewards, so plans to save next month collapse when next month arrives; commitment devices beat willpower.", shows: "A lock that auto-routes a fixed percent of each paycheck to a goal, plus a gauge of how much you spend in the 48 hours after payday." },
    { slug: "subscription-leak", title: "Subscription Leak Detector", author: "the endowment effect & status-quo bias", idea: "Cancelling something you already have registers as a loss, so unused autopay subscriptions quietly renew forever.", shows: "Your subscriptions ranked by annual cost with cancel toggles and a running tally of the yearly money you recover." },
    { slug: "raise-catcher", title: "Raise Catcher", author: "Benartzi & Thaler, Save More Tomorrow", idea: "People won't cut today's spending to save, but will pre-commit to saving more out of future raises, because take-home never drops.", shows: "Your income timeline with the detected raise highlighted and split into what you keep versus what future-you banks, projected forward." },
    { slug: "pain-restorer", title: "Pain Restorer", author: "Prelec & Loewenstein (pain of paying)", idea: "The small pain of paying restrains spending, but cards, UPI and autopay decouple paying from buying and mute it.", shows: "A payment-method split and a spend-receipt that reframes cumulative UPI taps the way watching cash leave your wallet would." },
    { slug: "free-trap", title: "Free-Trap Tracker", author: "Dan Ariely (zero-price effect)", idea: "A price of zero over-values the deal emotionally, which is why free trials and no-cost EMI pull you into spending you wouldn't choose.", shows: "A trial-to-paid timeline with a countdown ring to the first real charge and the projected annual cost if you do nothing." },
    { slug: "anchor-reset", title: "Anchor Reset", author: "anchoring (Tversky & Kahneman)", idea: "Budgets stick to arbitrary anchors, usually last month's number, which perpetuates over- and under-budgeting.", shows: "Envelopes whose budget hasn't moved while actual spend drifted, each with a one-tap reset to a budget anchored on your real average." },
  ],
  methods: [
    { slug: "fifty-thirty-twenty", title: "50 / 30 / 20", author: "Elizabeth Warren, All Your Worth", idea: "Of every take-home rupee: at most 50% to needs, at most 30% to wants, at least 20% saved. Coarse on purpose.", shows: "One stacked bar of needs, wants and savings against 50% and 80% gridlines, with bands that turn amber when they breach." },
    { slug: "to-be-assigned", title: "To Be Assigned", author: "Jesse Mecham, YNAB", idea: "Give every rupee a job until the unassigned balance is exactly zero; you budget money you actually have, not a forecast.", shows: "A large To Be Assigned number you count down to zero by funding envelopes; it turns green only at exactly zero." },
    { slug: "years-to-fi", title: "Years to Freedom", author: "the Trinity Study (FIRE, 4% rule)", idea: "About 25 times your annual spending funds a 4% yearly withdrawal for decades; your savings rate, not your salary, sets the clock.", shows: "An FI-progress ring and a net-worth curve approaching the FI line, with a savings-rate slider that visibly shrinks the years." },
    { slug: "cash-stack", title: "Cash-Stack Envelopes", author: "the cash-stuffing envelope method", idea: "Pre-fill labelled envelopes with cash; when one is empty, spending in that category stops until next month.", shows: "Each envelope as a tactile cash stack that visibly empties as you spend, greyed and locked once it hits zero." },
    { slug: "kakeibo", title: "Kakeibo Reflection", author: "Hani Motoko (Japan, 1904)", idea: "A mindful household ledger built on four monthly questions; the act of recording each spend creates a pause that curbs it.", shows: "A calm month-end card that walks the four questions with a Needs/Wants/Culture/Unexpected breakdown and a save-target check." },
    { slug: "thirty-day", title: "The 30-Day List", author: "the cooling-off rule", idea: "Park every non-essential want on a list for 30 days before buying; most urges fade, and the few that survive are the real ones.", shows: "Wishlist cards with 30-day countdown rings; matured items ask keep or skip, and skipping tallies the money you talked yourself out of." },
  ],
  shipped: [
    { slug: "balance-sheet", title: "Assets vs Liabilities", author: "Robert Kiyosaki, Rich Dad Poor Dad", idea: "An asset puts money in your pocket; a liability takes it out. The rich buy assets; the rest buy liabilities they think are assets.", shows: "Your balance sheet split into genuinely income-generating assets versus liabilities, with the honest net-worth line." },
    { slug: "compounding", title: "The Compounding Lesson", author: "Morgan Housel, The Psychology of Money", idea: "Wealth is mostly time, not timing; modest, consistent growth left alone becomes enormous through compounding.", shows: "An interactive curve showing how a modest monthly amount grows over decades once compounding does the heavy lifting." },
    { slug: "runway", title: "Runway & Safety Net", author: "emergency-fund planning", idea: "Your runway is how long your savings cover you if income stops; a real safety net is built deliberately, not hoped for.", shows: "A forward runway with a burn-down chart, plus a contingency planner that maps the monthly saving to fund a target cushion." },
    { slug: "make-room", title: "Make Room", author: "YNAB Rules 2 & 3 (roll with the punches)", idea: "When a surprise expense hits a full budget, you don't overspend, you reshuffle; predictable surprises get pre-funded instead.", shows: "Propose an expense and see each envelope's breathing room, the impact, and a recovery plan; recurring ones suggest a sinking fund." },
  ],
};

phase('Write copy');
const keys = Object.keys(GROUPS);
const results = await parallel(
  keys.map((g) => () =>
    agent(
      `${BRIEF}\n\n# YOUR LENSES (group: ${g})\nWrite copy for each. Keep each lens' slug exactly as given.\n${JSON.stringify(GROUPS[g], null, 2)}`,
      { label: `copy:${g}`, phase: 'Write copy', schema: SCHEMA },
    ),
  ),
);

const lenses = results.filter(Boolean).flatMap((r) => r.lenses || []);
return { count: lenses.length, lenses };
