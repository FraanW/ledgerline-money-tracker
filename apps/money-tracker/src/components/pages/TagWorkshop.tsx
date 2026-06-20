"use client";

import React, { useMemo, useState } from "react";
import { AppShell } from "../AppShell";
import { Card, Button, Badge } from "../primitives";
import { useRules, useCategories } from "../../lib/hooks";
import {
  api,
  ApiError,
  type RuleWire,
  type RulePatternKind,
  type CategoryWire,
  type CategoryKind,
} from "../../lib/api";
import { previewDescriptions } from "../../mocks/rules";

const CATEGORY_KINDS: CategoryKind[] = ["expense", "income", "transfer"];

/** Kind → Badge tone, so income/expense/transfer read at a glance. */
function kindTone(kind: CategoryKind): "positive" | "warning" | "neutral" {
  return kind === "income" ? "positive" : kind === "expense" ? "warning" : "neutral";
}

/**
 * Tag Workshop — manage categorization rules (M11), wired live. Rules list with
 * enable/disable (PUT) + delete; an add-rule form (POST); a live preview that
 * runs the actual rule set against sample descriptions. Lower priority wins.
 */

const inputCls =
  "rounded-md border border-border bg-surface px-2 py-2 text-[0.85em] text-text outline-none focus:border-accent";

/** Run the rule set over a description, return the winning category name. */
function matchRule(desc: string, rules: RuleWire[], catName: (id: string) => string): string | null {
  const active = rules.filter((r) => r.enabled).slice().sort((a, b) => a.priority - b.priority);
  for (const r of active) {
    const d = desc.toUpperCase();
    if (r.patternKind === "contains" && d.includes(r.pattern.toUpperCase())) return catName(r.categoryId);
    if (r.patternKind === "equals" && d === r.pattern.toUpperCase()) return catName(r.categoryId);
    if (r.patternKind === "regex") {
      try {
        if (new RegExp(r.pattern, "i").test(desc)) return catName(r.categoryId);
      } catch {
        /* skip bad regex */
      }
    }
  }
  return null;
}

export function TagWorkshop() {
  const rules = useRules();
  const cats = useCategories();

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cats.data ?? []) m.set(c.id, c.name);
    return (id: string) => m.get(id) ?? id;
  }, [cats.data]);

  const list = rules.data ?? [];
  const sorted = list.slice().sort((a, b) => a.priority - b.priority);

  const toggle = (r: RuleWire) => {
    const { id, ...rest } = r;
    api.rules.update(id, { ...rest, enabled: !r.enabled }).then(() => rules.refetch());
  };
  const remove = (id: string) => {
    api.rules.remove(id).then(() => rules.refetch());
  };

  return (
    <AppShell active="tags">
      <div className="mx-auto max-w-5xl p-5 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.8em] font-bold">Tag Workshop</h1>
            <p className="text-[0.95em] text-text-muted">
              Teach Money Tracker how to sort your transactions. Lower priority number wins.
            </p>
          </div>
        </div>

        {/* Categories — the vocabulary rules tag into. Add-only (no delete API). */}
        <CategoriesPanel
          categories={cats.data ?? []}
          loading={cats.loading}
          onDone={() => cats.refetch()}
        />

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Rules list */}
          <div className="lg:col-span-2">
            <Card>
              <div className="border-b border-border px-4 py-3 text-[0.85em] font-medium text-text-muted">
                {list.length} rules
              </div>
              {rules.loading && list.length === 0 ? (
                <p className="p-6 text-center text-[0.9em] text-text-muted">Loading…</p>
              ) : list.length === 0 ? (
                <p className="p-6 text-center text-[0.9em] text-text-muted">No rules yet — add one on the right.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {sorted.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">{r.patternKind}</Badge>
                          <code className="truncate rounded-sm bg-surface-raised px-1.5 py-0.5 text-[0.85em]">
                            {r.pattern}
                          </code>
                          <span className="text-text-muted">→</span>
                          <Badge tone="accent">{catName(r.categoryId)}</Badge>
                        </div>
                        <div className="mt-1 text-[0.78em] text-text-muted">priority {r.priority}</div>
                      </div>
                      <button
                        onClick={() => toggle(r)}
                        aria-pressed={r.enabled}
                        className="grid h-6 w-11 shrink-0 place-items-center rounded-full px-0.5 text-[0.6em]"
                        style={{
                          background: r.enabled ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)",
                          color: r.enabled ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        {r.enabled ? "ON" : "OFF"}
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        aria-label="Delete rule"
                        className="shrink-0 text-[0.9em] text-text-muted transition-colors hover:text-negative"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Add rule + preview */}
          <div className="flex flex-col gap-4">
            <AddRuleForm categories={cats.data ?? []} onDone={() => rules.refetch()} />

            <Card className="p-4">
              <h3 className="mb-2 font-bold">Live preview</h3>
              <p className="mb-3 text-[0.8em] text-text-muted">
                How your current rules would tag sample descriptions:
              </p>
              <ul className="flex flex-col gap-2">
                {previewDescriptions.map((d) => {
                  const cat = matchRule(d, list, catName);
                  return (
                    <li key={d} className="flex items-center justify-between gap-2 text-[0.82em]">
                      <code className="truncate text-text-muted">{d}</code>
                      {cat ? <Badge tone="neutral">{cat}</Badge> : <Badge tone="warning">Unallocated</Badge>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function AddRuleForm({
  categories,
  onDone,
}: {
  categories: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [patternKind, setPatternKind] = useState<RulePatternKind>("contains");
  const [pattern, setPattern] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim() || !categoryId) {
      setError("Pattern and category are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.rules.create({ patternKind, pattern: pattern.trim(), categoryId });
      setPattern("");
      setCategoryId("");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-bold">Add a rule</h3>
      <form onSubmit={submit}>
        <label className="mb-1 block text-[0.8em] text-text-muted">When description…</label>
        <div className="mb-3 flex gap-2">
          <select
            className={inputCls}
            value={patternKind}
            onChange={(e) => setPatternKind(e.target.value as RulePatternKind)}
          >
            <option value="contains">contains</option>
            <option value="equals">equals</option>
            <option value="regex">regex</option>
          </select>
          <input
            className={`min-w-0 flex-1 ${inputCls}`}
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="e.g. STARBUCKS"
          />
        </div>
        <label className="mb-1 block text-[0.8em] text-text-muted">…tag it as</label>
        <select
          className={`mb-3 w-full ${inputCls}`}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Choose a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {error && <p className="mb-2 text-[0.8em] text-negative">{error}</p>}
        <Button disabled={busy}>{busy ? "Adding…" : "Add rule"}</Button>
      </form>
    </Card>
  );
}

function CategoriesPanel({
  categories,
  loading,
  onDone,
}: {
  categories: CategoryWire[];
  loading: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give the category a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.categories.create(name.trim(), kind);
      setName("");
      setKind("expense");
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add category");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="text-[0.85em] font-medium text-text-muted">
          {categories.length} categories
        </div>
        <span className="text-[0.78em] text-text-muted">
          The buckets your rules sort transactions into.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
        {/* List */}
        <div className="md:col-span-2">
          {loading && categories.length === 0 ? (
            <p className="py-6 text-center text-[0.9em] text-text-muted">Loading…</p>
          ) : categories.length === 0 ? (
            <p className="py-6 text-center text-[0.9em] text-text-muted">
              No categories yet — add your first one to start tagging.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {sorted.map((c) => (
                <li
                  key={c.id}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5"
                >
                  <span className="text-[0.9em] font-medium text-text">{c.name}</span>
                  <Badge tone={kindTone(c.kind)}>{c.kind}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add form */}
        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.78em] text-text-muted">New category</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
            />
          </label>
          <select
            className={inputCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
            aria-label="Category kind"
          >
            {CATEGORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {error && <p className="text-[0.8em] text-negative">{error}</p>}
          <Button disabled={busy}>{busy ? "Adding…" : "Add category"}</Button>
        </form>
      </div>
    </Card>
  );
}
