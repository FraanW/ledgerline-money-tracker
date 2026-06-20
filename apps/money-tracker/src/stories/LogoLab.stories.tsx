import type { Meta, StoryObj } from "@storybook/react";
import React, { useId } from "react";

/**
 * Logo Lab — six SVG logo concepts for Money Tracker / Ledgerline, all tied to
 * the envelope-ledger idea. Each renders as an app-icon tile across our brand
 * palettes + wordmark lockups, so we can pick a direction and iterate live.
 * (We can recreate the winner in Pencil later.)
 */
const meta: Meta = { title: "Brand/Logo Lab", parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj;

const DISPLAY = "'Spectral', Georgia, serif";
const GROTESK = "'Bricolage Grotesque', system-ui, sans-serif";

interface Pal { name: string; bg: string; fg: string; accent: string; glow: string; chip: string }
const PALETTES: Pal[] = [
  { name: "Evergreen (master)", bg: "linear-gradient(135deg,#157a5f 0%,#36b9a0 100%)", fg: "#ffffff", accent: "#c6ff3a", glow: "0 12px 36px rgba(21,122,95,0.40)", chip: "#157a5f" },
  { name: "Lime / Dark", bg: "linear-gradient(135deg,#1a1d22 0%,#0a0b0d 100%)", fg: "#c6ff3a", accent: "#ffffff", glow: "0 12px 36px rgba(198,255,58,0.26)", chip: "#0a0b0d" },
  { name: "Navy", bg: "linear-gradient(135deg,#1c5a86 0%,#0e3552 100%)", fg: "#ffffff", accent: "#c6ff3a", glow: "0 12px 36px rgba(19,69,107,0.40)", chip: "#13456b" },
  { name: "Mono / Light", bg: "#f6f4ee", fg: "#15241d", accent: "#c4892a", glow: "0 12px 30px rgba(0,0,0,0.10)", chip: "#e7e1d4" },
];

type Glyph = (p: { color: string; accent: string; size?: number }) => React.ReactElement;

/* ── 1. Envelope-₹ ─ the flap opens onto a rupee ──────────────────────────── */
const EnvRupee: Glyph = ({ color, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="20" y="32" width="80" height="58" rx="13" />
    <path d="M23 38 L60 66 L97 38" />
    <text x="60" y="86" textAnchor="middle" fontSize="30" fontWeight={800} fill={color} stroke="none" fontFamily={GROTESK}>₹</text>
  </svg>
);

/* ── 2. Ledger-L ─ an L built from ledger rule-lines + a coin dot ─────────── */
const LedgerL: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M40 24 V96 H98" />
    <path d="M56 42 H92" strokeWidth={5} opacity={0.85} />
    <path d="M56 60 H92" strokeWidth={5} opacity={0.85} />
    <path d="M56 78 H92" strokeWidth={5} opacity={0.85} />
    <circle cx="40" cy="24" r="6.5" fill={accent} stroke="none" />
  </svg>
);

/* ── 3. Envelope-Arrow ─ the flap is an upward arrow (money grows) ────────── */
const EnvArrow: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="22" y="50" width="76" height="46" rx="13" />
    <path d="M34 62 L60 34 L86 62" stroke={accent} />
    <path d="M60 34 V74" stroke={accent} />
  </svg>
);

/* ── 4. Fits-Check ─ envelope whose seam is a checkmark (the math adds up) ── */
const FitsCheck: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="20" y="32" width="80" height="58" rx="13" />
    <path d="M23 38 L60 66 L97 38" opacity={0.5} />
    <path d="M42 64 L55 78 L82 48" stroke={accent} strokeWidth={8} />
  </svg>
);

/* ── 5. Coin-Slot ─ a coin dropping into an envelope slot ─────────────────── */
const CoinSlot: Glyph = ({ color, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="24" y="34" width="72" height="62" rx="14" />
    <path d="M44 50 H76" strokeWidth={8} />
    <circle cx="60" cy="74" r="14" />
    <text x="60" y="80" textAnchor="middle" fontSize="17" fontWeight={800} fill={color} stroke="none" fontFamily={GROTESK}>₹</text>
  </svg>
);

/* ── 6. Stacked Envelopes ─ three offset envelopes (the three personas) ───── */
const Stack: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="30" y="40" width="60" height="40" rx="8" opacity={0.4} transform="rotate(-7 60 60)" />
    <rect x="30" y="48" width="60" height="40" rx="8" opacity={0.7} transform="rotate(0 60 68)" />
    <g transform="translate(0,8)">
      <rect x="30" y="48" width="60" height="40" rx="8" />
      <path d="M33 52 L60 70 L87 52" />
      <circle cx="84" cy="50" r="6" fill={accent} stroke="none" />
    </g>
  </svg>
);

/* ── Elevated round — money · saving · distinctive (trademark-grade) ──────── */

// Negative-space ₹: a premium card-chip with the rupee KNOCKED OUT (the brand
// shows through). The "discover-the-₹" mark — distinctive + ownable.
const NegSpaceRupee: Glyph = ({ color, size = 120 }) => {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs>
        <mask id={id}>
          <rect width="120" height="120" fill="#fff" />
          <text x="60" y="87" textAnchor="middle" fontSize="82" fontWeight={800} fontFamily={GROTESK} fill="#000">₹</text>
        </mask>
      </defs>
      <rect x="10" y="10" width="100" height="100" rx="28" fill={color} mask={`url(#${id})`} />
    </svg>
  );
};

// Rising ₹: the rupee paired with an ascending growth line — money that grows.
const RisingRupee: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <text x="42" y="88" textAnchor="middle" fontSize="74" fontWeight={800} fill={color} fontFamily={GROTESK}>₹</text>
    <path d="M28 92 L52 66 L68 78 L96 38" stroke={accent} strokeWidth={8} />
    <path d="M81 38 H96 V53" stroke={accent} strokeWidth={8} />
  </svg>
);

// Coin growth: three ascending coins — the visual of savings compounding.
const CoinGrowth: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="32" cy="88" r="17" />
    <circle cx="60" cy="70" r="17" />
    <circle cx="88" cy="52" r="17" />
    <text x="88" y="58" textAnchor="middle" fontSize="19" fontWeight={800} fill={accent} stroke="none" fontFamily={GROTESK}>₹</text>
  </svg>
);

// Ledger-₹: the rupee resting on ledger rule-lines — the Ledgerline identity.
const LedgerRupee: Glyph = ({ color, accent, size = 120 }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" strokeLinecap="round">
    <path d="M28 52 H92" stroke={accent} strokeWidth={5} opacity={0.5} />
    <path d="M28 70 H92" stroke={accent} strokeWidth={5} opacity={0.5} />
    <path d="M28 88 H92" stroke={accent} strokeWidth={5} opacity={0.5} />
    <text x="60" y="84" textAnchor="middle" fontSize="66" fontWeight={800} fill={color} fontFamily={GROTESK}>₹</text>
  </svg>
);

const ELEVATED: { key: string; name: string; tag: string; Glyph: Glyph }[] = [
  { key: "negspace", name: "Negative-space ₹", tag: "the rupee knocked out — premium + ownable", Glyph: NegSpaceRupee },
  { key: "rising", name: "Rising ₹", tag: "money that grows (saving)", Glyph: RisingRupee },
  { key: "coingrowth", name: "Coin Growth", tag: "savings compounding", Glyph: CoinGrowth },
  { key: "ledgerrupee", name: "Ledger-₹", tag: "the Ledgerline identity", Glyph: LedgerRupee },
];

const CONCEPTS: { key: string; name: string; tag: string; Glyph: Glyph }[] = [
  { key: "envrupee", name: "Envelope-₹", tag: "the flap opens onto a rupee", Glyph: EnvRupee },
  { key: "ledgerl", name: "Ledger-L", tag: "an L from ledger rule-lines", Glyph: LedgerL },
  { key: "envarrow", name: "Envelope-Arrow", tag: "flap as an upward arrow", Glyph: EnvArrow },
  { key: "fitscheck", name: "Fits-Check", tag: "the seam is a checkmark", Glyph: FitsCheck },
  { key: "coinslot", name: "Coin-Slot", tag: "a coin into the slot", Glyph: CoinSlot },
  { key: "stack", name: "Stacked Envelopes", tag: "three personas, one system", Glyph: Stack },
];

function Tile({ Glyph, pal, size = 132, glyphSize = 96, radius = 0.26 }: { Glyph: Glyph; pal: Pal; size?: number; glyphSize?: number; radius?: number }) {
  return (
    <div className="grid place-items-center" style={{ width: size, height: size, borderRadius: size * radius, background: pal.bg, boxShadow: pal.glow }}>
      <Glyph color={pal.fg} accent={pal.accent} size={glyphSize} />
    </div>
  );
}

function Page({ children, title, sub }: { children: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="min-h-screen bg-[#fafaf7] px-6 py-10 md:px-12" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div className="mx-auto max-w-6xl">
        <p className="text-[0.8rem] font-semibold uppercase tracking-[0.25em] text-[#157a5f]">Money Tracker · Ledgerline</p>
        <h1 className="mt-1 text-[2.2rem] font-bold text-[#15241d]" style={{ fontFamily: DISPLAY }}>{title}</h1>
        <p className="mt-1 max-w-2xl text-[#5c6a61]">{sub}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export const Marks: Story = {
  name: "1 · All six marks",
  render: () => (
    <Page title="Six logo directions" sub="Each tied to the envelope-ledger idea, shown on the evergreen master palette. Pick a direction and I'll refine it.">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        {CONCEPTS.map((c) => (
          <div key={c.key} className="flex flex-col items-center gap-3 rounded-2xl border border-[#e7e1d4] bg-white p-6">
            <Tile Glyph={c.Glyph} pal={PALETTES[0]!} />
            <div className="text-center">
              <div className="font-bold text-[#15241d]" style={{ fontFamily: DISPLAY }}>{c.name}</div>
              <div className="text-[0.82rem] text-[#5c6a61]">{c.tag}</div>
            </div>
          </div>
        ))}
      </div>
    </Page>
  ),
};

export const AppIcons: Story = {
  name: "2 · App icons across palettes",
  render: () => (
    <Page title="App icons × palettes" sub="Every concept across the master evergreen, lime-on-dark, navy, and mono-light palettes — how it'd look as a home-screen icon.">
      <div className="flex flex-col gap-8">
        {CONCEPTS.map((c) => (
          <div key={c.key}>
            <div className="mb-3 text-[0.95rem] font-bold text-[#15241d]" style={{ fontFamily: DISPLAY }}>{c.name} <span className="font-normal text-[#5c6a61]">· {c.tag}</span></div>
            <div className="flex flex-wrap gap-5">
              {PALETTES.map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-2">
                  <Tile Glyph={c.Glyph} pal={p} size={104} glyphSize={76} />
                  <span className="text-[0.7rem] text-[#5c6a61]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  ),
};

function Wordmark({ Glyph, pal, dark = false }: { Glyph: Glyph; pal: Pal; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl p-5" style={{ background: dark ? "#0a0b0d" : "#ffffff", border: dark ? "none" : "1px solid #e7e1d4" }}>
      <Tile Glyph={Glyph} pal={pal} size={60} glyphSize={44} radius={0.28} />
      <div className="leading-none">
        <div className="text-[1.45rem] font-bold tracking-tight" style={{ fontFamily: DISPLAY, color: dark ? "#f2f4f5" : "#15241d" }}>Money Tracker</div>
        <div className="mt-1 text-[0.66rem] font-semibold uppercase tracking-[0.32em]" style={{ color: dark ? "#9aa3ad" : "#5c6a61" }}>by Ledgerline</div>
      </div>
    </div>
  );
}

export const Wordmarks: Story = {
  name: "3 · Wordmark lockups",
  render: () => (
    <Page title="Wordmark lockups" sub="The icon + name, on light and dark, for the top directions.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Wordmark Glyph={EnvRupee} pal={PALETTES[0]!} />
        <Wordmark Glyph={EnvRupee} pal={PALETTES[1]!} dark />
        <Wordmark Glyph={LedgerL} pal={PALETTES[0]!} />
        <Wordmark Glyph={LedgerL} pal={PALETTES[1]!} dark />
        <Wordmark Glyph={FitsCheck} pal={PALETTES[0]!} />
        <Wordmark Glyph={EnvArrow} pal={PALETTES[2]!} />
      </div>
    </Page>
  ),
};

export const ElevatedMarks: Story = {
  name: "5 · Elevated marks (money · saving · ownable)",
  render: () => (
    <Page title="Elevated round — professional & ownable" sub="Tuned for money + saving, fintech-professional, and distinctive enough to trademark (not a generic envelope). Across all palettes.">
      <div className="flex flex-col gap-8">
        {ELEVATED.map((c) => (
          <div key={c.key}>
            <div className="mb-3 text-[0.95rem] font-bold text-[#15241d]" style={{ fontFamily: DISPLAY }}>{c.name} <span className="font-normal text-[#5c6a61]">· {c.tag}</span></div>
            <div className="flex flex-wrap gap-5">
              {PALETTES.map((p) => (
                <div key={p.name} className="flex flex-col items-center gap-2">
                  <Tile Glyph={c.Glyph} pal={p} size={104} glyphSize={92} />
                  <span className="text-[0.7rem] text-[#5c6a61]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  ),
};

export const ProShowcase: Story = {
  name: "6 · Pro showcase (Negative-space ₹)",
  render: () => (
    <Page title="Showcase — the ownable pick" sub="Negative-space ₹: a premium card-chip with the rupee knocked out, brand showing through. Money, saving, unmistakably ours — and it holds down to a favicon.">
      <div className="flex flex-col items-center gap-10 rounded-3xl py-14" style={{ background: "linear-gradient(135deg,#157a5f 0%,#0e3552 130%)" }}>
        <Tile Glyph={NegSpaceRupee} pal={PALETTES[0]!} size={208} glyphSize={208} radius={0.001} />
        <div className="text-center leading-none">
          <div className="text-[2.4rem] font-bold tracking-tight text-white" style={{ fontFamily: DISPLAY }}>Money Tracker</div>
          <div className="mt-2 text-[0.8rem] font-semibold uppercase tracking-[0.34em] text-[#c6ff3a]">by Ledgerline</div>
        </div>
        <div className="flex items-end gap-5">
          {[64, 44, 32, 20].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Tile Glyph={NegSpaceRupee} pal={PALETTES[0]!} size={s} glyphSize={s} radius={0.27} />
              <span className="text-[0.62rem] text-white/70">{s}px</span>
            </div>
          ))}
        </div>
      </div>
    </Page>
  ),
};

export const Showcase: Story = {
  name: "4 · Showcase (Envelope-₹)",
  render: () => (
    <Page title="Showcase — Envelope-₹" sub="My lead pick: the clearest 'budgeting + money' mark, scales cleanly to a favicon. Tell me your favorite and I'll polish it.">
      <div className="flex flex-col items-center gap-10 rounded-3xl bg-[#0a0b0d] py-14">
        <Tile Glyph={EnvRupee} pal={PALETTES[1]!} size={200} glyphSize={150} />
        <div className="text-center leading-none">
          <div className="text-[2.4rem] font-bold tracking-tight text-[#f2f4f5]" style={{ fontFamily: DISPLAY }}>Money Tracker</div>
          <div className="mt-2 text-[0.8rem] font-semibold uppercase tracking-[0.34em] text-[#c6ff3a]">by Ledgerline</div>
        </div>
        <div className="flex items-end gap-5">
          {[64, 44, 32, 20].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Tile Glyph={EnvRupee} pal={PALETTES[1]!} size={s} glyphSize={s * 0.72} radius={0.27} />
              <span className="text-[0.62rem] text-[#9aa3ad]">{s}px</span>
            </div>
          ))}
        </div>
      </div>
    </Page>
  ),
};
