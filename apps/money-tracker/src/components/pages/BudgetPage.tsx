"use client";

import React, { useState } from "react";
import { AppShell } from "../AppShell";
import { Card, Button } from "../primitives";
import { useBudget, useCategories } from "../../lib/hooks";
import { formatINR, rupeesToPaise } from "../../lib/format";
import { api, ApiError, type EnvelopeWire, type CategoryKind } from "../../lib/api";

const CATEGORY_KINDS: CategoryKind[] = ["expense", "income", "transfer"];

/**
 * Budget — the never-negative envelope ledger (backend M12), wired live.
 * Period selector defaults to the current month; arrows step a month.
 * Money in/out happens through allocate + income endpoints; all rupee inputs
 * are converted to integer paise before they hit the API.
 */

/** "2026-06" for the current month. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Step a "YYYY-MM" period by ±1 month. */
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date((y ?? 2026), (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-06" → "June 2026". */
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date((y ?? 2026), (m ?? 1) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.9em] text-text outline-none focus:border-accent";

export function BudgetPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const budget = useBudget(period);
  const cats = useCategories();

  return (
    <AppShell active="budget">
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.8em] font-bold tracking-tight">Budget</h1>
            <p className="text-[0.95em] text-text-muted">
              Money lives in envelopes — you can only spend what&apos;s inside.
            </p>
          </div>
          {/* Period selector */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1">
            <button
              aria-label="Previous month"
              className="grid h-7 w-7 place-items-center rounded-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
              onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
            >
              ‹
            </button>
            <span className="min-w-[8.5rem] text-center text-[0.9em] font-medium">{periodLabel(period)}</span>
            <button
              aria-label="Next month"
              className="grid h-7 w-7 place-items-center rounded-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
              onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
            >
              ›
            </button>
          </div>
        </div>

        {budget.error && (
          <Card className="mt-5 border-negative p-4">
            <p className="text-[0.9em] text-negative">{budget.error}</p>
          </Card>
        )}

        {budget.loading && !budget.data && (
          <p className="mt-6 text-[0.9em] text-text-muted">Loading budget…</p>
        )}

        {budget.data && (
          <>
            {/* Summary row. NOTE: the API returns income as a signed ledger value
                (credits are negative in the income account), so we show |income|. */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryStat label="Income" valueMinor={Math.abs(budget.data.incomeMinor)} />
              <SummaryStat
                label="Unallocated"
                valueMinor={budget.data.unallocatedMinor}
                tone={budget.data.unallocatedMinor < 0 ? "warning" : "default"}
                hint={
                  budget.data.unallocatedMinor < 0
                    ? "You've budgeted more than you have."
                    : undefined
                }
              />
              <SummaryStat label="Spent" valueMinor={budget.data.spentMinor} />
            </div>

            {/* Add money + new envelope */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <AddIncomeForm onDone={budget.refetch} />
              <NewEnvelopeForm
                period={period}
                categories={(cats.data ?? []).filter((c) => c.kind === "expense")}
                onCategoryCreated={cats.refetch}
                onDone={budget.refetch}
              />
            </div>

            {/* Envelopes */}
            <h2 className="mt-7 mb-3 font-bold">Envelopes</h2>
            {budget.data.envelopes.length === 0 ? (
              <Card className="p-6 text-center text-[0.9em] text-text-muted">
                No envelopes yet for {periodLabel(period)}. Create one above to start budgeting.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {budget.data.envelopes.map((env) => (
                  <EnvelopeCard key={env.id} env={env} onDone={budget.refetch} />
                ))}
              </div>
            )}

            <p className="mt-6 text-[0.85em] text-text-muted">
              Leftover balances roll over into next month automatically.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SummaryStat({
  label,
  valueMinor,
  tone = "default",
  hint,
}: {
  label: string;
  valueMinor: number;
  tone?: "default" | "warning";
  hint?: string;
}) {
  const color = tone === "warning" ? "var(--ml-color-warning)" : "var(--ml-color-text)";
  return (
    <Card className="p-4">
      <div className="text-[0.78em] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 font-display text-[1.5em] font-bold tabular-nums" style={{ color }}>
        {formatINR(valueMinor)}
      </div>
      {hint && <div className="mt-1 text-[0.78em] text-warning">{hint}</div>}
    </Card>
  );
}

function AddIncomeForm({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.budget.addIncome(rupeesToPaise(rupees), description.trim() || undefined);
      setAmount("");
      setDescription("");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add money");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-bold">Add money</h3>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.78em] text-text-muted">Amount (₹)</span>
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.78em] text-text-muted">Note (optional)</span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="June salary"
          />
        </label>
        {error && <p className="text-[0.8em] text-negative">{error}</p>}
        <Button disabled={busy}>{busy ? "Adding…" : "Add to budget"}</Button>
      </form>
    </Card>
  );
}

function NewEnvelopeForm({
  period,
  categories,
  onCategoryCreated,
  onDone,
}: {
  period: string;
  categories: { id: string; name: string }[];
  /** Refetch the category list after a new one is created. */
  onCategoryCreated: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline "+ New category" mini-form state.
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<CategoryKind>("expense");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  // A category created here may not be in the refetched list yet on the next
  // render — keep it locally so the pre-selected option shows immediately.
  const [justCreated, setJustCreated] = useState<{ id: string; name: string } | null>(null);

  // Merge the freshly-created category in (de-duped) so the <select> can show it
  // even before the parent's refetch lands.
  const options =
    justCreated && !categories.some((c) => c.id === justCreated.id)
      ? [...categories, justCreated]
      : categories;

  async function createCategory(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError("Give the category a name.");
      return;
    }
    setCatBusy(true);
    setCatError(null);
    try {
      const { categoryId: newId } = await api.categories.create(catName.trim(), catKind);
      const created = { id: newId, name: catName.trim() };
      setJustCreated(created);
      setCategoryId(newId); // pre-select it
      onCategoryCreated(); // refetch the canonical list
      setCatName("");
      setCatKind("expense");
      setAddingCat(false);
    } catch (e) {
      setCatError(e instanceof ApiError ? e.message : "Couldn't add category");
    } finally {
      setCatBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.budget.createEnvelope(name.trim(), period, categoryId || undefined);
      setName("");
      setCategoryId("");
      setJustCreated(null);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create envelope");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-bold">New envelope</h3>
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.78em] text-text-muted">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Groceries"
          />
        </label>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.78em] text-text-muted">Category (optional)</span>
            {!addingCat && (
              <button
                type="button"
                onClick={() => {
                  setAddingCat(true);
                  setCatError(null);
                }}
                className="text-[0.78em] text-accent underline underline-offset-4 hover:opacity-80"
              >
                + New category
              </button>
            )}
          </div>
          <select
            className={inputCls}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">No category</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Inline mini-form — its own submit handler, so it never posts the envelope. */}
        {addingCat && (
          <div className="rounded-md border border-border bg-surface-raised p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.78em] font-medium text-text">New category</span>
              <button
                type="button"
                onClick={() => {
                  setAddingCat(false);
                  setCatError(null);
                }}
                className="text-[0.78em] text-text-muted hover:text-text"
              >
                Cancel
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <input
                className={inputCls}
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Dining out"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createCategory(e);
                }}
              />
              <select
                className={inputCls}
                value={catKind}
                onChange={(e) => setCatKind(e.target.value as CategoryKind)}
                aria-label="Category kind"
              >
                {CATEGORY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {catError && <p className="text-[0.8em] text-negative">{catError}</p>}
              {/* Native type="button" so it never submits the outer envelope form. */}
              <button
                type="button"
                disabled={catBusy}
                onClick={createCategory}
                className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-[0.85em] font-medium text-text transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {catBusy ? "Adding…" : "Add category"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-[0.8em] text-negative">{error}</p>}
        <Button disabled={busy}>{busy ? "Creating…" : "Create envelope"}</Button>
      </form>
    </Card>
  );
}

function EnvelopeCard({ env, onDone }: { env: EnvelopeWire; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = env.balanceMinor === 0;

  async function fund(e: React.FormEvent) {
    e.preventDefault();
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.budget.allocate({ toEnvelopeId: env.id, amountMinor: rupeesToPaise(rupees) });
      setAmount("");
      setOpen(false);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.isWouldGoNegative) {
        setError("Not enough in that envelope.");
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn't fund envelope");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[1.02em] font-medium text-text">{env.name}</span>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Fund"}
        </Button>
      </div>
      <div className="mt-2">
        <span
          className="text-[1.5em] font-bold tabular-nums"
          style={{ color: empty ? "var(--ml-color-text-muted)" : "var(--ml-color-text)" }}
        >
          {formatINR(env.balanceMinor)}
        </span>
        <span className="ml-1 text-[0.8em] text-text-muted">left</span>
      </div>
      {open && (
        <form onSubmit={fund} className="mt-3 flex flex-col gap-2">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in ₹"
            autoFocus
          />
          {error && <p className="text-[0.8em] text-negative">{error}</p>}
          <Button disabled={busy}>{busy ? "Funding…" : "Allocate"}</Button>
        </form>
      )}
    </Card>
  );
}
