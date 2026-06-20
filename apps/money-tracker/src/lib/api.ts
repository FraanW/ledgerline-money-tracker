"use client";

import { getSession, clearSession } from "./session";
import { getAccessToken, setAccessToken } from "./authToken";
import { isSupabaseEnabled } from "./supabase";

/**
 * Typed fetch client for the Ledgerline backend (Sweep 2 contract).
 *
 * Every type here mirrors the *wire* contract exactly — these are deliberately
 * separate from @ledgerline/types' design-phase domain types (which the mocks +
 * Storybook still use). All money is integer paise (`minor`).
 *
 * Identity headers: when a Supabase access token is cached (real auth) we send
 * `Authorization: Bearer <token>` + `X-Tenant-Id` and OMIT `X-User-Id` — the
 * backend resolves the user from the verified JWT and ignores X-User-Id. With
 * no token (dev mode / keyless clone) we fall back to the legacy X-Tenant-Id /
 * X-User-Id pair pulled from the dev session. `skipIdentity` paths still carry
 * the bearer when available (harmless, and /identity/me requires it).
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_LEDGERLINE_API ?? "http://localhost:8090";

/* ── Wire types ───────────────────────────────────────────────────────────── */

export interface MoneyWire {
  minor: number;
  currency: string;
}

export type TxnDirection = "debit" | "credit";

export interface TransactionWire {
  id: string;
  accountId: string;
  postedAt: string; // yyyy-MM-dd
  amount: MoneyWire;
  direction: TxnDirection;
  rawDescription: string;
  merchant: string | null;
  categoryId: string | null;
  source: string;
  ingestedAt: string;
  statementId: string | null;
  recurringSeriesId: string | null;
}

export interface TransactionsResponse {
  items: TransactionWire[];
  total: number;
}

export interface TransactionsQuery {
  from?: string;
  to?: string;
  categoryId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface EnvelopeWire {
  id: string;
  name: string;
  balanceMinor: number;
  categoryId: string | null;
}

export interface BudgetResponse {
  period: string;
  envelopes: EnvelopeWire[];
  unallocatedMinor: number;
  incomeMinor: number;
  spentMinor: number;
}

export interface StatementWire {
  id: string;
  accountId: string;
  fileName: string;
  source: string;
  acceptedCount: number;
  duplicateCount: number;
  errorCount: number;
  status: string;
  uploadedAt: string;
}

export interface IngestError {
  lineNumber: number;
  message: string;
}

export interface IngestResponse {
  statementId: string;
  totalRows: number;
  accepted: number;
  duplicates: number;
  errors: IngestError[];
}

export type AccountType = "savings" | "current" | "credit_card" | "other";

export interface AccountWire {
  id: string;
  institution: string;
  accountType: AccountType;
  maskedNumber: string;
  currency: string;
  createdAt: string;
}

export type CategoryKind = "income" | "expense" | "transfer";

export interface CategoryWire {
  id: string;
  name: string;
  kind: CategoryKind;
}

export type RulePatternKind = "contains" | "equals" | "regex";

export interface RuleWire {
  id: string;
  patternKind: RulePatternKind;
  pattern: string;
  categoryId: string;
  priority: number;
  enabled: boolean;
}

export type PersonaTheme = "genz" | "millennial" | "senior";

export interface UserSettingsWire {
  preferredTheme: PersonaTheme;
  locale: string;
  logRemindersEnabled: boolean;
  spendingAlertsEnabled: boolean;
}

export interface TenantSettingsWire {
  monthlyRolloverEnabled: boolean;
  defaultCurrency: string;
}

export type HoldingKind = "index" | "equity" | "debt" | "gold" | "ulip";

export interface HoldingWire {
  id: string;
  name: string;
  kind: HoldingKind;
  investedMinor: number;
  valueMinor: number;
  expenseRatioBps: number | null;
  regularPlan: boolean;
}

export type NetWorthItemType = "asset" | "liability";

export interface NetWorthItemWire {
  id: string;
  itemType: NetWorthItemType;
  name: string;
  amountMinor: number;
  incomeGenerating: boolean | null;
  note: string | null;
}

export interface NetWorthResponse {
  items: NetWorthItemWire[];
  totals: { assetsMinor: number; liabilitiesMinor: number; netMinor: number };
}

export interface GoalWire {
  id: string;
  name: string;
  icon: string | null;
  targetMinor: number;
  currentMinor: number;
  envelopeId: string | null;
}

export interface MembershipWire {
  tenantId: string;
  tenantName: string;
  role: string;
  status: string;
}

/** `GET /api/v0/identity/me` — the bearer-resolved caller + their workspaces. */
export interface IdentityMeResponse {
  userId: string;
  email: string;
  displayName: string;
  memberships: MembershipWire[];
}

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface MemberWire {
  userId: string;
  displayName: string;
  email: string;
  role: MemberRole;
  status: string;
  joinedAt: string;
}

/* ── Error type ───────────────────────────────────────────────────────────── */

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed (${status})`;
    super(msg);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
  /** True for the budget 422 "would_go_negative" case. */
  get isWouldGoNegative(): boolean {
    return (
      this.status === 422 &&
      !!this.body &&
      typeof this.body === "object" &&
      "error" in this.body &&
      (this.body as { error: unknown }).error === "would_go_negative"
    );
  }
}

/* ── Core request helpers ─────────────────────────────────────────────────── */

/**
 * Headers for a normal (identity-bearing) request.
 *
 * Real auth: bearer token present → `Authorization: Bearer <token>` +
 * `X-Tenant-Id` (workspace selector), with X-User-Id intentionally omitted.
 * Dev mode: no token → legacy `X-Tenant-Id` + `X-User-Id` from the dev session.
 */
function identityHeaders(): Record<string, string> {
  const token = getAccessToken();
  const s = getSession();
  const h: Record<string, string> = {};
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
    if (s) h["X-Tenant-Id"] = s.tenantId;
  } else if (s) {
    h["X-Tenant-Id"] = s.tenantId;
    h["X-User-Id"] = s.userId;
  }
  return h;
}

/**
 * Headers for a `skipIdentity` request (identity bootstrap paths). We never
 * attach the dev session here, but we DO forward the bearer when one exists —
 * harmless on the legacy paths and required by /identity/me.
 */
function bearerOnlyHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Soft-landing for an expired/invalid session. Only fires under real auth: a
 * 401 means the bearer is dead, so we clear the token cache + dev session and
 * bounce to /login. In dev mode a 401 surfaces as an ApiError to the caller.
 */
function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  setAccessToken(null);
  clearSession();
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { skipIdentity?: boolean } = {},
): Promise<T> {
  const { skipIdentity, headers, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      ...(skipIdentity ? bearerOnlyHeaders() : identityHeaders()),
      ...(headers as Record<string, string> | undefined),
    },
  });
  const body = await parseBody(res);
  if (!res.ok) {
    if (res.status === 401 && isSupabaseEnabled) handleUnauthorized();
    throw new ApiError(res.status, body);
  }
  return body as T;
}

function jsonRequest<T>(
  path: string,
  method: string,
  payload: unknown,
  opts: { skipIdentity?: boolean } = {},
): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    skipIdentity: opts.skipIdentity,
  });
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ── Endpoint groups ──────────────────────────────────────────────────────── */

export const api = {
  identity: {
    /**
     * The login endpoint of the JWT era: bearer in → caller + memberships out.
     * Auto-provisions the Ledgerline user on first sight. Requires a cached
     * access token (skipIdentity keeps the dev session off but forwards the
     * bearer); 401s when the token is missing/expired.
     */
    me: () =>
      request<IdentityMeResponse>("/api/v0/identity/me", { skipIdentity: true }),
    createUser: (email: string, displayName: string) =>
      jsonRequest<{ userId: string }>(
        "/api/v0/identity/users",
        "POST",
        { email, displayName },
        { skipIdentity: true },
      ),
    createWorkspace: (ownerUserId: string, displayName: string) =>
      jsonRequest<{ tenantId: string }>(
        "/api/v0/identity/workspaces",
        "POST",
        { ownerUserId, displayName },
        { skipIdentity: true },
      ),
    memberships: (userId: string) =>
      request<MembershipWire[]>(
        `/api/v0/identity/users/${userId}/memberships`,
        { skipIdentity: true },
      ),
  },

  transactions: {
    list: (query: TransactionsQuery = {}) =>
      request<TransactionsResponse>(`/api/v0/transactions${qs({ ...query })}`),
  },

  budget: {
    get: (period: string) =>
      request<BudgetResponse>(`/api/v0/budget${qs({ period })}`),
    createEnvelope: (name: string, period: string, categoryId?: string) =>
      jsonRequest<{ envelopeId: string }>("/api/v0/budget/envelopes", "POST", {
        name,
        period,
        categoryId,
      }),
    addIncome: (amountMinor: number, description?: string) =>
      jsonRequest<{ transferId: string }>("/api/v0/budget/income", "POST", {
        amountMinor,
        description,
      }),
    allocate: (input: {
      toEnvelopeId: string;
      amountMinor: number;
      fromEnvelopeId?: string;
      description?: string;
    }) => jsonRequest<{ transferId: string }>("/api/v0/budget/allocate", "POST", input),
  },

  statements: {
    list: () => request<{ items: StatementWire[] }>("/api/v0/statements"),
  },

  ingest: {
    /**
     * Upload a CSV or PDF statement. `password` unlocks password-protected
     * PDFs (Indian bank statements) ON THE FLY — it travels with this one
     * request, is used in memory server-side, and is never stored or logged.
     */
    statement: (accountId: string, file: File, password?: string) => {
      const fd = new FormData();
      fd.append("accountId", accountId);
      fd.append("file", file);
      if (password) fd.append("password", password);
      return request<IngestResponse>("/api/v0/ingest/statement", {
        method: "POST",
        body: fd,
      });
    },
  },

  accounts: {
    list: () => request<{ items: AccountWire[] }>("/api/v0/accounts"),
    create: (input: {
      institution: string;
      accountType: AccountType;
      maskedNumber: string;
    }) => jsonRequest<{ accountId: string }>("/api/v0/accounts", "POST", input),
  },

  categories: {
    list: () => request<{ items: CategoryWire[] }>("/api/v0/categories"),
    create: (name: string, kind: CategoryKind) =>
      jsonRequest<{ categoryId: string }>("/api/v0/categories", "POST", {
        name,
        kind,
      }),
  },

  rules: {
    list: () => request<{ items: RuleWire[] }>("/api/v0/rules"),
    create: (input: {
      patternKind: RulePatternKind;
      pattern: string;
      categoryId: string;
      priority?: number;
    }) => jsonRequest<{ ruleId: string }>("/api/v0/rules", "POST", input),
    update: (id: string, body: Omit<RuleWire, "id">) =>
      jsonRequest<unknown>(`/api/v0/rules/${id}`, "PUT", body),
    remove: (id: string) =>
      request<unknown>(`/api/v0/rules/${id}`, { method: "DELETE" }),
  },

  settings: {
    getUser: () => request<UserSettingsWire>("/api/v0/settings/user"),
    updateUser: (body: Partial<UserSettingsWire>) =>
      jsonRequest<unknown>("/api/v0/settings/user", "PUT", body),
    getTenant: () => request<TenantSettingsWire>("/api/v0/settings/tenant"),
    updateTenant: (body: { monthlyRolloverEnabled: boolean }) =>
      jsonRequest<unknown>("/api/v0/settings/tenant", "PUT", body),
  },

  holdings: {
    list: () => request<{ items: HoldingWire[] }>("/api/v0/holdings"),
  },

  networth: {
    get: () => request<NetWorthResponse>("/api/v0/networth"),
  },

  goals: {
    list: () => request<{ items: GoalWire[] }>("/api/v0/goals"),
  },

  members: {
    list: () => request<{ items: MemberWire[] }>("/api/v0/members"),
    add: (input: { email: string; displayName?: string; role: MemberRole }) =>
      jsonRequest<{ userId: string; role: MemberRole }>(
        "/api/v0/members",
        "POST",
        input,
      ),
    changeRole: (userId: string, role: MemberRole) =>
      jsonRequest<{ userId: string; role: MemberRole }>(
        `/api/v0/members/${userId}`,
        "PUT",
        { role },
      ),
    remove: (userId: string) =>
      request<{ removed: boolean }>(`/api/v0/members/${userId}`, {
        method: "DELETE",
      }),
  },
};
