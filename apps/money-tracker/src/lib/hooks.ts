"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import {
  api,
  ApiError,
  type AccountWire,
  type BudgetResponse,
  type CategoryWire,
  type GoalWire,
  type HoldingWire,
  type MemberWire,
  type NetWorthResponse,
  type RuleWire,
  type StatementWire,
  type TenantSettingsWire,
  type TransactionsQuery,
  type TransactionsResponse,
  type UserSettingsWire,
} from "./api";

/**
 * Small useEffect+useState data hooks. Each returns { data, loading, error,
 * refetch }. They wait for a session (so we never fire identity-bound calls
 * without headers), surface a quiet inline error, and never throw to render.
 */
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Generic fetcher. `deps` re-runs the fetch; `enabled` gates it (needs session). */
function useResource<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  enabled: boolean,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Hold the latest fetcher without making it a dependency (avoids refetch loops
  // when callers pass an inline closure).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetcherRef.current()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : "Something went wrong");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refetch };
}

/** True once the session is read AND present — every data call needs it. */
function useReady(): boolean {
  const { session, ready } = useSession();
  return ready && !!session;
}

export function useTransactions(params: TransactionsQuery = {}): Resource<TransactionsResponse> {
  const ready = useReady();
  const key = JSON.stringify(params);
  return useResource<TransactionsResponse>(
    () => api.transactions.list(params),
    [key],
    ready,
  );
}

export function useBudget(period: string): Resource<BudgetResponse> {
  const ready = useReady();
  return useResource<BudgetResponse>(() => api.budget.get(period), [period], ready);
}

export function useStatements(): Resource<StatementWire[]> {
  const ready = useReady();
  return useResource<StatementWire[]>(
    () => api.statements.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useAccounts(): Resource<AccountWire[]> {
  const ready = useReady();
  return useResource<AccountWire[]>(
    () => api.accounts.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useCategories(): Resource<CategoryWire[]> {
  const ready = useReady();
  return useResource<CategoryWire[]>(
    () => api.categories.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useRules(): Resource<RuleWire[]> {
  const ready = useReady();
  return useResource<RuleWire[]>(
    () => api.rules.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useUserSettings(): Resource<UserSettingsWire> {
  const ready = useReady();
  return useResource<UserSettingsWire>(() => api.settings.getUser(), [], ready);
}

export function useTenantSettings(): Resource<TenantSettingsWire> {
  const ready = useReady();
  return useResource<TenantSettingsWire>(() => api.settings.getTenant(), [], ready);
}

export function useHoldings(): Resource<HoldingWire[]> {
  const ready = useReady();
  return useResource<HoldingWire[]>(
    () => api.holdings.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useNetWorth(): Resource<NetWorthResponse> {
  const ready = useReady();
  return useResource<NetWorthResponse>(() => api.networth.get(), [], ready);
}

export function useGoals(): Resource<GoalWire[]> {
  const ready = useReady();
  return useResource<GoalWire[]>(
    () => api.goals.list().then((r) => r.items),
    [],
    ready,
  );
}

export function useMembers(): Resource<MemberWire[]> {
  const ready = useReady();
  return useResource<MemberWire[]>(
    () => api.members.list().then((r) => r.items),
    [],
    ready,
  );
}
