import React from "react";
import { Button, Card, Badge } from "../primitives";
import { Quote } from "../Quote";
import { Icon } from "../Icon";

/**
 * Marketing landing page — hero, the wedge, features, how-it-works, footer.
 * Fully responsive: single column on mobile, multi-column from `md`/`lg`.
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md text-accent-contrast" style={{ background: "var(--ml-gradient-accent)" }}>₹</span>
          <span className="font-display text-[1.1em] font-bold">Money Tracker</span>
        </div>
        <div className="hidden items-center gap-6 text-[0.9em] text-text-muted sm:flex">
          <a>How it works</a>
          <a>Why us</a>
          <Button>Get started</Button>
        </div>
        <div className="sm:hidden"><Button>Start</Button></div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 md:grid-cols-2 md:py-20">
          <div className="flex flex-col gap-5">
            <Badge tone="accent">AA-native · never-negative budgeting</Badge>
            <h1 className="font-display text-[2.4em] font-bold leading-[1.05] md:text-[3em]">
              Money that actually <span style={{ color: "var(--ml-color-accent)" }}>stays in its lane.</span>
            </h1>
            <p className="max-w-md text-[1.05em] text-text-muted">
              Pull every account into one place, sort it automatically, and give every rupee a job —
              with a budget that can&apos;t go negative. No loans pushed. Ever.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button>Connect your accounts</Button>
              <Button variant="secondary">See a demo</Button>
            </div>
            <div className="flex items-center gap-4 text-[0.82em] text-text-muted">
              <span className="inline-flex items-center gap-1.5"><Icon name="shield" emoji="🔒" size={15} /> RBI Account Aggregator</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="globe" emoji="🇮🇳" size={15} /> Built for Indian banks</span>
            </div>
          </div>
          <div className="surface-gradient surface-grain rounded-lg p-6 text-accent-contrast">
            <div className="text-[0.85em] opacity-90">June 2026 · all accounts</div>
            <div className="mt-1 font-display text-[2.4em] font-bold">₹14,250 unallocated</div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[["Rent", "₹20,000"], ["Groceries", "₹3,200"], ["Fun", "₹0"]].map(([k, v]) => (
                <div key={k} className="rounded-md bg-white/15 p-3 backdrop-blur">
                  <div className="text-[0.75em] opacity-90">{k}</div>
                  <div className="font-bold">{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The wedge */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <Card raised className="p-6 md:p-10">
          <Quote cite="the gap nobody filled" size="1.6em">
            Every money app tracks what you already spent. Ours stops you before you overspend — and never
            sells you a loan to do it.
          </Quote>
        </Card>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { name: "link", emoji: "🔗", title: "One honest view", body: "Every bank and card in one place via the Account Aggregator — no manual entry." },
            { name: "budget", emoji: "✉️", title: "Envelope budgeting", body: "Give every rupee a job. You can only spend what's in the envelope — never-negative, guaranteed." },
            { name: "brain", emoji: "🧠", title: "Auto-sorted", body: "Transactions categorise themselves; corrections become rules, so it gets smarter every month." },
          ].map((f) => (
            <Card key={f.title} interactive className="p-6">
              <span className="grid h-11 w-11 place-items-center rounded-md bg-surface-raised text-accent">
                <Icon name={f.name} emoji={f.emoji} size={22} />
              </span>
              <h3 className="mt-3 font-display text-[1.2em] font-bold">{f.title}</h3>
              <p className="mt-1 text-[0.92em] text-text-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <h2 className="mb-6 font-display text-[1.6em] font-bold">How it works</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["1", "Connect or upload", "Link accounts via AA, or drop a bank statement to start in seconds."],
            ["2", "We sort it", "Every transaction lands in the right envelope, automatically."],
            ["3", "Stay in control", "Spend within your envelopes; what escapes shows up as Unallocated to re-budget."],
          ].map(([n, t, b]) => (
            <div key={n} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-contrast">{n}</span>
              <div>
                <h3 className="font-bold">{t}</h3>
                <p className="text-[0.9em] text-text-muted">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA + footer */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <Card raised className="flex flex-col items-center gap-4 p-8 text-center md:p-12">
          <h2 className="font-display text-[1.8em] font-bold">Give every rupee a job.</h2>
          <p className="max-w-md text-text-muted">Free to start. No card pushing, no data selling — you&apos;re the customer, not the product.</p>
          <Button>Get started free</Button>
        </Card>
      </section>
      <footer className="border-t border-border px-5 py-8 text-center text-[0.82em] text-text-muted">
        Money Tracker · a Ledgerline surface · © 2026
      </footer>
    </div>
  );
}
