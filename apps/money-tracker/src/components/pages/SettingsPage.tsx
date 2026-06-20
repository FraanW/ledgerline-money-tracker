"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../AppShell";
import { Card, Button, Badge } from "../primitives";
import {
  useAccounts,
  useUserSettings,
  useTenantSettings,
  useMembers,
} from "../../lib/hooks";
import {
  api,
  ApiError,
  type AccountType,
  type MemberRole,
  type MemberWire,
} from "../../lib/api";
import { useSession, clearSession } from "../../lib/session";

const MEMBER_ROLES: MemberRole[] = ["owner", "admin", "member", "viewer"];

/**
 * Settings — profile from the session, linked accounts from the live list, and
 * preference toggles wired to the user/tenant settings PUTs (optimistic). Loan
 * offers are hardcoded OFF and non-interactive on purpose. Sign-out clears the
 * dev session and returns to /login.
 */

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-[0.9em] text-text outline-none focus:border-accent";

export function SettingsPage() {
  const router = useRouter();
  const { session } = useSession();
  const accounts = useAccounts();
  const userSettings = useUserSettings();
  const tenantSettings = useTenantSettings();
  const members = useMembers();
  const [showLink, setShowLink] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  // Optimistic by default; flips off the first time a write 403s. Disabling the
  // selects then is the simplest honest signal that this role can't manage.
  const [canManage, setCanManage] = useState(true);

  // Catch the read-all-write-some 403 once and quietly drop into read-only.
  const handleForbidden = (e: unknown): boolean => {
    if (e instanceof ApiError && e.status === 403) {
      setCanManage(false);
      return true;
    }
    return false;
  };

  const onLogout = () => {
    clearSession();
    router.replace("/login");
  };

  const initial = (session?.displayName.trim()[0] ?? "A").toUpperCase();

  return (
    <AppShell active="settings">
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <h1 className="font-display text-[1.8em] font-bold">Settings</h1>
        <p className="text-[0.95em] text-text-muted">Accounts, preferences, and your data.</p>

        {/* Profile */}
        <section className="mt-6">
          <h2 className="mb-2 font-bold">Profile</h2>
          <Card className="flex items-center gap-4 p-4">
            <span
              className="grid h-12 w-12 place-items-center rounded-full text-accent-contrast"
              style={{ background: "var(--ml-gradient-accent)" }}
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{session?.displayName ?? "—"}</div>
              <div className="text-[0.85em] text-text-muted">{session?.email ?? ""}</div>
              <div className="text-[0.78em] text-text-muted">{session?.tenantName}</div>
            </div>
          </Card>
        </section>

        {/* Household members */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Household members</h2>
            <Button onClick={() => setShowInvite((s) => !s)}>
              {showInvite ? "Close" : "+ Invite member"}
            </Button>
          </div>
          {!canManage && (
            <p className="mb-2 text-[0.82em] text-text-muted">
              Your role can&rsquo;t manage members.
            </p>
          )}
          {showInvite && (
            <Card className="mb-3 p-4">
              <InviteMemberForm
                disabled={!canManage}
                onForbidden={handleForbidden}
                onInvited={() => {
                  members.refetch();
                  setShowInvite(false);
                }}
              />
            </Card>
          )}
          <Card>
            <ul className="divide-y divide-border">
              {(members.data ?? []).map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  isSelf={m.userId === session?.userId}
                  canManage={canManage}
                  onForbidden={handleForbidden}
                  onChanged={() => members.refetch()}
                />
              ))}
              {(members.data ?? []).length === 0 && !members.loading && (
                <li className="px-4 py-3 text-[0.85em] text-text-muted">
                  No members yet.
                </li>
              )}
            </ul>
          </Card>
        </section>

        {/* Linked accounts */}
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-bold">Linked accounts</h2>
            <Button onClick={() => setShowLink((s) => !s)}>{showLink ? "Close" : "+ Link account"}</Button>
          </div>
          {showLink && (
            <Card className="mb-3 p-4">
              <LinkAccountForm
                onCreated={() => {
                  accounts.refetch();
                  setShowLink(false);
                }}
              />
            </Card>
          )}
          <Card>
            <ul className="divide-y divide-border">
              {(accounts.data ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{a.institution}</div>
                    <div className="text-[0.82em] text-text-muted">
                      {a.accountType.replace("_", " ")} · {a.maskedNumber}
                    </div>
                  </div>
                  <Badge tone="positive">connected</Badge>
                </li>
              ))}
              {(accounts.data ?? []).length === 0 && !accounts.loading && (
                <li className="px-4 py-3 text-[0.85em] text-text-muted">No accounts linked yet.</li>
              )}
              <li className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">Account Aggregator</div>
                  <div className="text-[0.82em] text-text-muted">Auto-sync via Setu / Sahamati</div>
                </div>
                <Badge tone="warning">coming in v1</Badge>
              </li>
            </ul>
          </Card>
        </section>

        {/* Preferences */}
        <section className="mt-6">
          <h2 className="mb-2 font-bold">Preferences</h2>
          <Card className="flex flex-col gap-3 p-4">
            <Toggle
              title="Log reminders"
              desc="Nudge me every 12 hours to log & categorize spends"
              value={userSettings.data?.logRemindersEnabled ?? false}
              disabled={!userSettings.data}
              onChange={(on) => api.settings.updateUser({ logRemindersEnabled: on })}
            />
            <Toggle
              title="Spending alerts"
              desc="Nudge me when an envelope is nearly empty"
              value={userSettings.data?.spendingAlertsEnabled ?? false}
              disabled={!userSettings.data}
              onChange={(on) => api.settings.updateUser({ spendingAlertsEnabled: on })}
            />
            <Toggle
              title="Monthly rollover"
              desc="Carry unspent envelope money into next month"
              value={tenantSettings.data?.monthlyRolloverEnabled ?? false}
              disabled={!tenantSettings.data}
              onChange={(on) => api.settings.updateTenant({ monthlyRolloverEnabled: on })}
            />
            {/* Loan offers: hardcoded OFF, non-interactive — a product promise. */}
            <div className="flex items-center justify-between gap-3 opacity-80">
              <div>
                <div className="font-medium">Loan offers</div>
                <div className="text-[0.82em] text-text-muted">We never show these. Ever.</div>
              </div>
              <span
                className="grid h-6 w-11 place-items-center rounded-full text-[0.6em]"
                style={{ background: "var(--ml-color-surface-raised)", color: "var(--ml-color-text-muted)" }}
              >
                OFF
              </span>
            </div>
          </Card>
        </section>

        {/* Your data + sign out */}
        <section className="mt-6">
          <h2 className="mb-2 font-bold">Your data</h2>
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[0.9em] text-text-muted">Sign out of this device, or manage your data.</div>
            <div className="flex gap-2">
              <Button variant="secondary">Export</Button>
              <Button variant="secondary" onClick={onLogout}>
                Sign out
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

/** Optimistic toggle — flips local state, fires the PUT, reverts on failure. */
function Toggle({
  title,
  desc,
  value,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  value: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => Promise<unknown>;
}) {
  const [on, setOn] = useState(value);
  const [synced, setSynced] = useState(value);
  // Keep in sync once the real value loads in.
  if (value !== synced) {
    setSynced(value);
    setOn(value);
  }

  const flip = () => {
    if (disabled) return;
    const next = !on;
    setOn(next); // optimistic
    onChange(next).catch(() => setOn(!next));
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-[0.82em] text-text-muted">{desc}</div>
      </div>
      <button
        onClick={flip}
        disabled={disabled}
        aria-pressed={on}
        className="grid h-6 w-11 place-items-center rounded-full text-[0.6em] disabled:opacity-50"
        style={{
          background: on ? "var(--ml-color-accent)" : "var(--ml-color-surface-raised)",
          color: on ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

function LinkAccountForm({ onCreated }: { onCreated: () => void }) {
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
      setError(e instanceof ApiError ? e.message : "Couldn't link account");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
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
        <Button disabled={busy}>{busy ? "Linking…" : "Link account"}</Button>
      </div>
    </form>
  );
}

/**
 * One member row: avatar initial, name/email, an optimistic role select (reverts
 * + shows an inline error on failure, incl. the last-owner 400), and a two-click
 * remove. The current user's row is tagged "(you)" with remove disabled.
 */
function MemberRow({
  member,
  isSelf,
  canManage,
  onForbidden,
  onChanged,
}: {
  member: MemberWire;
  isSelf: boolean;
  canManage: boolean;
  onForbidden: (e: unknown) => boolean;
  onChanged: () => void;
}) {
  const [role, setRole] = useState<MemberRole>(member.role);
  const [synced, setSynced] = useState<MemberRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Re-sync local state when the refetched list brings a new authoritative role.
  if (member.role !== synced) {
    setSynced(member.role);
    setRole(member.role);
  }

  const initial = (member.displayName.trim()[0] ?? "?").toUpperCase();

  async function changeRole(next: MemberRole) {
    const prev = role;
    if (next === prev) return;
    setRole(next); // optimistic
    setError(null);
    try {
      await api.members.changeRole(member.userId, next);
      onChanged();
    } catch (e) {
      setRole(prev); // revert
      if (onForbidden(e)) return; // 403 → quiet page-level note
      setError(e instanceof ApiError ? e.message : "Couldn't change role");
    }
  }

  async function remove() {
    setError(null);
    setRemoving(true);
    try {
      await api.members.remove(member.userId);
      onChanged();
    } catch (e) {
      setRemoving(false);
      setConfirming(false);
      if (onForbidden(e)) return; // 403 → quiet page-level note
      setError(e instanceof ApiError ? e.message : "Couldn't remove member");
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.85em] text-accent-contrast"
          style={{ background: "var(--ml-gradient-accent)" }}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <div className="truncate font-medium">
            {member.displayName}
            {isSelf && <span className="text-text-muted"> (you)</span>}
          </div>
          <div className="truncate text-[0.82em] text-text-muted">{member.email}</div>
          {error && <p className="text-[0.78em] text-negative">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          className={inputCls + " w-auto"}
          value={role}
          disabled={!canManage}
          onChange={(e) => changeRole(e.target.value as MemberRole)}
        >
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {confirming ? (
          <div className="flex items-center gap-1" onMouseLeave={() => !removing && setConfirming(false)}>
            <button
              type="button"
              disabled={removing}
              onClick={remove}
              className="rounded-md border border-negative px-2 py-1 text-[0.8em] font-medium text-negative hover:bg-negative hover:text-surface disabled:opacity-50"
            >
              {removing ? "Removing…" : "Sure?"}
            </button>
            <button
              type="button"
              aria-label="Cancel remove"
              disabled={removing}
              onClick={() => setConfirming(false)}
              className="rounded-md px-2 py-1 text-[0.8em] text-text-muted hover:text-text disabled:opacity-50"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Remove ${member.displayName}`}
            disabled={!canManage || isSelf}
            onClick={() => setConfirming(true)}
            className="grid h-8 w-8 place-items-center rounded-md text-[1.1em] text-text-muted hover:text-negative disabled:cursor-default disabled:opacity-40 disabled:hover:text-text-muted"
          >
            &times;
          </button>
        )}
      </div>
    </li>
  );
}

function InviteMemberForm({
  disabled,
  onInvited,
  onForbidden,
}: {
  disabled?: boolean;
  onInvited: () => void;
  onForbidden: (e: unknown) => boolean;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.members.add({
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        role,
      });
      onInvited();
    } catch (e) {
      setBusy(false);
      if (onForbidden(e)) return; // 403 → quiet page-level note
      setError(e instanceof ApiError ? e.message : "Couldn't invite member");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        className={inputCls}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (e.g. partner@example.com)"
      />
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name (optional)"
        />
        <select
          className={inputCls}
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
        >
          <option value="viewer">Viewer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>
      <p className="text-[0.78em] text-text-muted">
        They sign in with this email to join.
      </p>
      {error && <p className="text-[0.8em] text-negative">{error}</p>}
      <div>
        <Button disabled={busy || disabled}>
          {busy ? "Inviting…" : "Invite member"}
        </Button>
      </div>
    </form>
  );
}
