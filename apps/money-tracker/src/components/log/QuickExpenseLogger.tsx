"use client";

import React, { useState } from "react";
import { Card } from "../primitives";
import { Icon } from "../Icon";
import { inr } from "../../lib/finance";

interface Cat {
  key: string;
  label: string;
  emoji: string;
}

// `as const` + an explicit non-empty annotation lets us index by a literal and
// look up by key without TS treating each element as possibly-undefined.
const CATS: readonly [Cat, ...Cat[]] = [
  { key: "food", label: "Food", emoji: "🍔" },
  { key: "travel", label: "Travel", emoji: "🚌" },
  { key: "shopping", label: "Shopping", emoji: "🛍️" },
  { key: "bills", label: "Bills", emoji: "🧾" },
  { key: "fun", label: "Fun", emoji: "🎉" },
  { key: "other", label: "Other", emoji: "✨" },
];

/** Category by key, falling back to the first (Food) — always defined. */
const catByKey = (key: string): Cat => CATS.find((c) => c.key === key) ?? CATS[0];

const QUICK = [50, 100, 200, 500];

interface Entry {
  id: number;
  amount: number;
  cat: Cat;
  note: string;
  time: string;
}

/**
 * 20-second expense logger for the GPay/cash gap — where statements never tell
 * you "₹120 travel, ₹80 food". Tap amount + category + go. Fully interactive.
 */
export function QuickExpenseLogger() {
  const [amount, setAmount] = useState<number>(0);
  const [cat, setCat] = useState(CATS[0]);
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState<Entry[]>([
    { id: 1, amount: 120, cat: catByKey("travel"), note: "auto to office", time: "9:12 AM" },
    { id: 2, amount: 80, cat: catByKey("food"), note: "chai + vada", time: "11:40 AM" },
  ]);

  const total = entries.reduce((s, e) => s + e.amount, 0);

  const add = () => {
    if (amount <= 0) return;
    const now = new Date();
    const time = now.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    setEntries((es) => [{ id: now.getTime(), amount, cat, note, time }, ...es]);
    setAmount(0);
    setNote("");
  };

  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[1.3em] font-bold text-text">Log a spend</h3>
        <div className="text-right">
          <div className="text-[0.72em] uppercase tracking-wide text-text-muted">Today</div>
          <div className="font-display text-[1.1em] font-bold text-text">{inr(total)}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="font-display text-[1.6em] font-bold text-text-muted">₹</span>
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value))}
          placeholder="0"
          className="w-full bg-transparent font-display text-[1.8em] font-bold text-text outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} onClick={() => setAmount((a) => a + q)} className="rounded-full border border-border px-3 py-1 text-[0.82em] text-text" style={{ cursor: "pointer" }}>
            +{q}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {CATS.map((c) => {
          const on = c.key === cat.key;
          return (
            <button
              key={c.key}
              onClick={() => setCat(c)}
              className="flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-[0.78em]"
              style={{ borderColor: on ? "var(--ml-color-accent)" : "var(--ml-color-border)", background: on ? "var(--ml-color-accent)" : "transparent", color: on ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text)", cursor: "pointer" }}
            >
              <Icon name={c.key} emoji={c.emoji} size={22} />
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional) — who'd you pay?" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-[0.88em] text-text" />
        <button onClick={add} className="rounded-md px-4 py-2 font-medium text-accent-contrast" style={{ background: "var(--ml-gradient-accent)", cursor: "pointer" }}>
          Add
        </button>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[0.82em] font-medium text-text-muted">Logged today</div>
        <ul className="divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Icon name={e.cat.key} emoji={e.cat.emoji} size={20} className="text-text-muted" />
                <div className="min-w-0">
                  <div className="text-[0.92em] font-medium text-text">{e.cat.label}</div>
                  <div className="truncate text-[0.78em] text-text-muted">{e.note || "—"} · {e.time}</div>
                </div>
              </div>
              <span className="font-display font-bold text-text tabular-nums">{inr(e.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
