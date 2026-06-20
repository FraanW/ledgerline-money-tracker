"use client";

import React, { useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { Card, Button, Badge } from "../primitives";
import {
  useTransactions,
  useCategories,
  useAccounts,
  useStatements,
} from "../../lib/hooks";
import { formatINR } from "../../lib/format";
import {
  api,
  ApiError,
  type TransactionWire,
  type CategoryWire,
  type AccountType,
  type IngestResponse,
} from "../../lib/api";

/**
 * Transactions — one honest unified feed, wired live. Search (q) + category
 * filter chips drive the query; results page 50 at a time (Load more grows the
 * window). The upload widget posts a statement to the ingest endpoint and shows
 * accepted / duplicate / error counts; a statements-history list sits below.
 */

const PAGE = 50;

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.9em] text-text outline-none focus:border-accent";

export function TransactionsPage() {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const cats = useCategories();
  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats.data ?? []) m.set(c.id, c.name);
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [cats.data]);

  // Reset the page window whenever the filters change.
  const txns = useTransactions({
    q: q.trim() || undefined,
    categoryId: categoryId ?? undefined,
    limit,
  });

  const items = txns.data?.items ?? [];
  const total = txns.data?.total ?? 0;
  const hasMore = items.length < total;

  return (
    <AppShell active="transactions">
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.8em] font-bold tracking-tight">Transactions</h1>
            <p className="text-[0.95em] text-text-muted">One honest feed across every account.</p>
          </div>
        </div>

        {/* Upload */}
        <div className="mt-5">
          <UploadWidget onUploaded={() => txns.refetch()} />
        </div>

        {/* Search */}
        <div className="mt-5">
          <input
            className={inputCls}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search merchant or description…"
          />
        </div>

        {/* Category filter chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          <FilterChip active={categoryId === null} onClick={() => { setCategoryId(null); setLimit(PAGE); }}>
            All
          </FilterChip>
          {(cats.data ?? []).map((c) => (
            <FilterChip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => { setCategoryId(c.id); setLimit(PAGE); }}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>

        {/* List */}
        {txns.error && (
          <Card className="mt-5 border-negative p-4">
            <p className="text-[0.9em] text-negative">{txns.error}</p>
          </Card>
        )}

        <Card className="mt-4">
          {txns.loading && items.length === 0 ? (
            <p className="p-6 text-center text-[0.9em] text-text-muted">Loading transactions…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-[0.9em] text-text-muted">No transactions match.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((t) => (
                <TxnRow key={t.id} txn={t} categoryName={catName(t.categoryId)} />
              ))}
            </ul>
          )}
        </Card>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
              Load more ({items.length} of {total})
            </Button>
          </div>
        )}

        {/* Statements history */}
        <h2 className="mt-8 mb-3 font-bold">Statement uploads</h2>
        <StatementHistory />
      </div>
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-[0.8em] font-medium transition-colors"
      style={{
        background: active ? "var(--ml-color-accent)" : "var(--ml-color-surface)",
        color: active ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
        borderColor: active ? "var(--ml-color-accent)" : "var(--ml-color-border)",
      }}
    >
      {children}
    </button>
  );
}

function TxnRow({ txn, categoryName }: { txn: TransactionWire; categoryName: string | null }) {
  const credit = txn.direction === "credit";
  const label = txn.merchant ?? txn.rawDescription;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[0.95em] font-medium">{label}</p>
        <p className="text-[0.8em] text-text-muted">{txn.postedAt}</p>
      </div>
      <div className="flex items-center gap-3">
        {categoryName ? <Badge tone="neutral">{categoryName}</Badge> : <Badge tone="warning">Unallocated</Badge>}
        <span
          className="w-24 text-right font-medium tabular-nums"
          style={{ color: credit ? "var(--ml-color-positive)" : "var(--ml-color-text)" }}
        >
          {credit ? "+" : "−"}
          {formatINR(txn.amount.minor)}
        </span>
      </div>
    </li>
  );
}

/* ── Upload ──────────────────────────────────────────────────────────────── */

function UploadWidget({ onUploaded }: { onUploaded: () => void }) {
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResponse | null>(null);

  const list = accounts.data ?? [];
  // Default the account select to the first account once loaded.
  const selected = accountId || list[0]?.id || "";
  // Banks mail statements as password-protected PDFs — show the unlock field.
  const isPdf =
    !!file &&
    (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.ingest.statement(
        selected,
        file,
        isPdf && password ? password : undefined,
      );
      setResult(res);
      setFile(null);
      setPassword("");
      onUploaded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-bold">Upload a statement</h3>
      {accounts.loading && list.length === 0 ? (
        <p className="text-[0.85em] text-text-muted">Loading accounts…</p>
      ) : list.length === 0 ? (
        <CreateAccountInline onCreated={() => accounts.refetch()} />
      ) : (
        <form onSubmit={upload} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.78em] text-text-muted">Account</span>
            <select
              className={inputCls}
              value={selected}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} · {a.maskedNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.78em] text-text-muted">Statement file (CSV or PDF)</span>
            <input
              className="text-[0.85em] text-text file:mr-3 file:rounded-md file:border-0 file:bg-surface-raised file:px-3 file:py-1.5 file:text-text"
              type="file"
              accept=".csv,.pdf,text/csv,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {isPdf && (
            <label className="flex flex-col gap-1">
              <span className="text-[0.78em] text-text-muted">PDF password (if protected)</span>
              <input
                className={inputCls}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="e.g. NAME0101"
                autoComplete="off"
              />
              <span className="text-[0.72em] text-text-muted">
                Used only to unlock this file — never stored.
              </span>
            </label>
          )}
          {error && <p className="text-[0.8em] text-negative">{error}</p>}
          <div>
            <Button disabled={busy || !file}>{busy ? "Uploading…" : "Upload"}</Button>
          </div>
        </form>
      )}

      {result && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Badge tone="positive">{result.accepted} accepted</Badge>
          <Badge tone="neutral">{result.duplicates} duplicates</Badge>
          {result.errors.length > 0 ? (
            <Badge tone="negative">{result.errors.length} errors</Badge>
          ) : (
            <Badge tone="neutral">0 errors</Badge>
          )}
          {result.errors.length > 0 && (
            <ul className="mt-2 w-full list-disc pl-5 text-[0.8em] text-text-muted">
              {result.errors.slice(0, 5).map((er) => (
                <li key={er.lineNumber}>
                  Line {er.lineNumber}: {er.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function CreateAccountInline({ onCreated }: { onCreated: () => void }) {
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("savings");
  const [maskedNumber, setMaskedNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!institution.trim() || !maskedNumber.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.accounts.create({
        institution: institution.trim(),
        accountType,
        maskedNumber: maskedNumber.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create account");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-[0.85em] text-text-muted">
        No accounts yet — add one to attach uploaded statements to.
      </p>
      <input
        className={inputCls}
        value={institution}
        onChange={(e) => setInstitution(e.target.value)}
        placeholder="Institution (e.g. HDFC Bank)"
      />
      <div className="flex gap-2">
        <select
          className={inputCls}
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
        >
          <option value="savings">Savings</option>
          <option value="current">Current</option>
          <option value="credit_card">Credit card</option>
          <option value="other">Other</option>
        </select>
        <input
          className={inputCls}
          value={maskedNumber}
          onChange={(e) => setMaskedNumber(e.target.value)}
          placeholder="XXXX4821"
        />
      </div>
      {error && <p className="text-[0.8em] text-negative">{error}</p>}
      <div>
        <Button disabled={busy}>{busy ? "Adding…" : "Add account"}</Button>
      </div>
    </form>
  );
}

function StatementHistory() {
  const statements = useStatements();
  const list = statements.data ?? [];

  if (statements.loading && list.length === 0) {
    return <p className="text-[0.9em] text-text-muted">Loading…</p>;
  }
  if (list.length === 0) {
    return (
      <Card className="p-6 text-center text-[0.9em] text-text-muted">
        No statements uploaded yet.
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-border">
        {list.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[0.9em] font-medium">{s.fileName}</p>
              <p className="text-[0.78em] text-text-muted">
                {s.acceptedCount} accepted · {s.duplicateCount} dup · {s.errorCount} err
              </p>
            </div>
            <Badge tone={s.status === "completed" ? "positive" : "neutral"}>{s.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
