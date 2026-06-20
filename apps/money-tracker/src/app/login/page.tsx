"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/primitives";
import {
  api,
  ApiError,
  type MembershipWire,
  type IdentityMeResponse,
} from "../../lib/api";
import { setSession, clearSession, useSession } from "../../lib/session";
import { supabase, isSupabaseEnabled } from "../../lib/supabase";
import { setAccessToken } from "../../lib/authToken";

/**
 * The product's front door.
 *
 * Two flows, picked at load by `isSupabaseEnabled`:
 *
 *  • REAL AUTH (Supabase keys present) — email + password sign-in, or a
 *    "Create account" toggle (sign-up; with confirm-email ON the user gets NO
 *    session until they confirm, which we say plainly). On a session we call
 *    GET /identity/me (bearer-resolved, auto-provisioning) to learn the user +
 *    their workspaces, then the workspace step picks/creates a household and
 *    stores the dev-session shape (used only for X-Tenant-Id + display chrome).
 *
 *  • DEV (no keys — a fresh clone) — the original identity-endpoint flow,
 *    unchanged, so the app still works without secrets.
 */
type Step = "identity" | "workspace";
type AuthMode = "signin" | "signup";

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-[0.95em] text-text outline-none transition-colors focus:border-accent";

function CoinMark({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/marketing/assets/logo-coin.png"
      alt="Money Tracker"
      width={size}
      height={size}
      style={{ borderRadius: 999, display: "block", boxShadow: "var(--ml-shadow-sm)" }}
    />
  );
}

/** Microcopy that only appears in dev mode (real auth needs no disclaimer). */
const DEV_NOTE = "Dev sign-in — Supabase auth replaces this.";

function LoginInner() {
  const router = useRouter();
  const { session, ready } = useSession();

  const [step, setStep] = useState<Step>("identity");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Shared identity fields.
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipWire[]>([]);
  const [creatingHousehold, setCreatingHousehold] = useState(false);
  const [householdName, setHouseholdName] = useState("");

  // Supabase-only fields.
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");

  // Once the client session read completes, if signed in, jump to the workspace
  // step pre-loaded with the user's memberships. Runs once per mount.
  const [hydrated, setHydrated] = useState(false);
  React.useEffect(() => {
    if (!ready || hydrated) return;
    setHydrated(true);
    if (session) {
      setEmail(session.email);
      setDisplayName(session.displayName);
      setUserId(session.userId);
      setStep("workspace");
      // Refresh memberships from whichever path is live.
      if (isSupabaseEnabled) {
        api.identity
          .me()
          .then((me) => setMemberships(me.memberships))
          .catch(() => {
            /* fall back to the create-household form if /me can't be read */
          });
      } else {
        api.identity
          .memberships(session.userId)
          .then((m) => setMemberships(m))
          .catch(() => {
            /* fall back to the create-household form if we can't list them */
          });
      }
    } else if (isSupabaseEnabled && supabase) {
      // No ll-session, but Supabase may already hold a live session (returning
      // user who refreshed /login). If so, resolve identity and skip ahead.
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) return;
        setAccessToken(data.session.access_token);
        api.identity.me().then(afterSession).catch(() => {
          /* stay on the sign-in form if /me can't be read */
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session]);

  const fail = (e: unknown) =>
    setError(
      e instanceof ApiError
        ? e.message
        : "Couldn't reach the backend — is it running on :8090?",
    );

  /* ── Supabase auth flow ─────────────────────────────────────────────────── */

  // After a Supabase session exists, learn who we are + our workspaces, then
  // move to the workspace step. Auto-provisions server-side on first sight.
  async function afterSession(me: IdentityMeResponse) {
    setUserId(me.userId);
    setEmail(me.email);
    setDisplayName(me.displayName);
    setMemberships(me.memberships);
    setCreatingHousehold(me.memberships.length === 0);
    setStep("workspace");
  }

  async function onSupabaseAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!email.trim() || !password) return;
    if (authMode === "signup" && !displayName.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (authMode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: displayName.trim() } },
        });
        if (err) {
          setError(err.message);
          return;
        }
        // With confirm-email ON, sign-up returns NO session — be honest.
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then sign in.");
          setAuthMode("signin");
          setPassword("");
          return;
        }
        setAccessToken(data.session.access_token);
        await afterSession(await api.identity.me());
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(err.message);
          return;
        }
        if (!data.session) {
          setError("Sign-in did not return a session. Try again.");
          return;
        }
        setAccessToken(data.session.access_token);
        await afterSession(await api.identity.me());
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  /* ── Dev identity flow (no Supabase) ────────────────────────────────────── */

  async function onIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { userId: uid } = await api.identity.createUser(email.trim(), displayName.trim());
      setUserId(uid);
      const mships = await api.identity.memberships(uid);
      setMemberships(mships);
      setCreatingHousehold(mships.length === 0);
      setStep("workspace");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  /* ── Workspace step (shared) ────────────────────────────────────────────── */

  function enter(tenantId: string, tenantName: string) {
    if (!userId) return;
    setSession({
      userId,
      tenantId,
      email: email.trim(),
      displayName: displayName.trim(),
      tenantName,
    });
    router.push("/dashboard");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !householdName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { tenantId } = await api.identity.createWorkspace(userId, householdName.trim());
      enter(tenantId, householdName.trim());
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  function backToIdentity() {
    setStep("identity");
    setError(null);
    setNotice(null);
    setCreatingHousehold(false);
    setHouseholdName("");
    setPassword("");
  }

  async function signOutHere() {
    if (isSupabaseEnabled && supabase) {
      await supabase.auth.signOut().catch(() => {
        /* clear locally regardless */
      });
    }
    setAccessToken(null);
    clearSession();
    setStep("identity");
    setUserId(null);
    setMemberships([]);
    setEmail("");
    setDisplayName("");
    setPassword("");
    setError(null);
    setNotice(null);
  }

  const showCreateForm = creatingHousehold || memberships.length === 0;
  const signedIn = !!session;
  const isSignup = authMode === "signup";

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg text-text lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel (the moment of arrival) ─────────────────────────────── */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-accent-contrast lg:flex xl:p-14"
        style={{ background: "var(--ml-gradient-hero)" }}
      >
        {/* soft depth wash so the gradient reads premium, not flat */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 12% 0%, rgba(255,255,255,0.18), transparent 55%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <CoinMark size={44} />
          <span className="font-display text-[1.25em] font-bold tracking-tight">Money Tracker</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-display text-[2.1em] font-bold leading-[1.15]">
            Your money, in plain sight.
          </p>
          <p className="mt-4 text-[1.02em] leading-relaxed opacity-90">
            A household ledger that&rsquo;s honest about where every rupee sits — envelopes
            you can actually spend from, statements that reconcile themselves, no
            guilt-trips.
          </p>
        </div>

        {!isSupabaseEnabled && (
          <div className="relative flex items-center gap-2 text-[0.8em] opacity-80">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "currentColor" }}
            />
            {DEV_NOTE}
          </div>
        )}
      </aside>

      {/* ── Form panel ──────────────────────────────────────────────────────── */}
      <main className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          {/* compact brand for the mobile layout (brand panel is desktop-only) */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <CoinMark size={36} />
            <span className="font-display text-[1.15em] font-bold tracking-tight">Money Tracker</span>
          </div>

          {/* ── Identity step ─────────────────────────────────────────────── */}
          {step === "identity" && isSupabaseEnabled && (
            <form onSubmit={onSupabaseAuth} className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-[1.7em] font-bold tracking-tight">
                  {isSignup ? "Create your account" : "Welcome back"}
                </h1>
                <p className="mt-1.5 text-[0.9em] leading-relaxed text-text-muted">
                  {isSignup
                    ? "A few details and your household is ready to set up."
                    : "Sign in to open your household ledger."}
                </p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8em] font-medium text-text-muted">Email</span>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  required
                />
              </label>
              {isSignup && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[0.8em] font-medium text-text-muted">Display name</span>
                  <input
                    className={inputCls}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Anaya Sharma"
                    autoComplete="name"
                    required
                  />
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8em] font-medium text-text-muted">Password</span>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  required
                />
              </label>
              {notice && (
                <p className="rounded-md border border-accent bg-surface px-3 py-2 text-[0.82em] text-accent">
                  {notice}
                </p>
              )}
              {error && (
                <p className="rounded-md border border-negative bg-surface px-3 py-2 text-[0.82em] text-negative">
                  {error}
                </p>
              )}
              <Button disabled={busy}>
                {busy
                  ? isSignup
                    ? "Creating account…"
                    : "Signing in…"
                  : isSignup
                    ? "Create account"
                    : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(isSignup ? "signin" : "signup");
                  setError(null);
                  setNotice(null);
                }}
                className="text-center text-[0.85em] text-accent underline underline-offset-4 hover:opacity-80"
              >
                {isSignup
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </form>
          )}

          {step === "identity" && !isSupabaseEnabled && (
            <form onSubmit={onIdentity} className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-[1.7em] font-bold tracking-tight">Welcome in</h1>
                <p className="mt-1.5 text-[0.9em] leading-relaxed text-text-muted">
                  Tell us who you are and we&rsquo;ll set up — or find — your household.
                </p>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8em] font-medium text-text-muted">Email</span>
                <input
                  className={inputCls}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.8em] font-medium text-text-muted">Display name</span>
                <input
                  className={inputCls}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Anaya Sharma"
                  required
                />
              </label>
              {error && (
                <p className="rounded-md border border-negative bg-surface px-3 py-2 text-[0.82em] text-negative">
                  {error}
                </p>
              )}
              <Button disabled={busy}>{busy ? "Setting things up…" : "Continue"}</Button>
              <p className="text-center text-[0.75em] text-text-muted lg:hidden">{DEV_NOTE}</p>
            </form>
          )}

          {/* ── Workspace step (shared) ───────────────────────────────────── */}
          {step === "workspace" && (
            <div className="flex flex-col gap-5">
              <div>
                <h1 className="font-display text-[1.7em] font-bold tracking-tight">
                  {showCreateForm ? "Name your household" : "Choose a workspace"}
                </h1>
                <p className="mt-1.5 text-[0.9em] leading-relaxed text-text-muted">
                  {showCreateForm
                    ? "This is your workspace — accounts, budgets, and data all live here."
                    : signedIn
                      ? `Signed in as ${displayName || email}. Open a household or switch.`
                      : "Pick the household you want to open."}
                </p>
              </div>

              {/* Continue-as shortcut when a session already exists. */}
              {signedIn && session && !showCreateForm && (
                <button
                  onClick={() => enter(session.tenantId, session.tenantName)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-accent bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-raised"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[0.78em] text-text-muted">Continue as {displayName}</div>
                    <div className="truncate font-medium text-text">{session.tenantName}</div>
                  </div>
                  <span className="shrink-0 text-accent">→</span>
                </button>
              )}

              {!showCreateForm && (
                <>
                  <ul className="flex flex-col gap-2">
                    {memberships.map((m) => (
                      <li key={m.tenantId}>
                        <button
                          onClick={() => enter(m.tenantId, m.tenantName)}
                          className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3 text-left transition-colors hover:border-accent"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-text">{m.tenantName}</div>
                            <div className="mt-0.5 text-[0.75em] text-text-muted">{m.status}</div>
                          </div>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="inline-flex items-center rounded-sm border border-border bg-surface px-2 py-0.5 text-[0.72em] font-medium capitalize text-text-muted">
                              {m.role}
                            </span>
                            <span className="text-accent">→</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      setCreatingHousehold(true);
                      setError(null);
                    }}
                    className="text-left text-[0.85em] text-accent underline underline-offset-4 hover:opacity-80"
                  >
                    + Create a new household instead
                  </button>
                </>
              )}

              {showCreateForm && (
                <form onSubmit={onCreate} className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[0.8em] font-medium text-text-muted">Household name</span>
                    <input
                      className={inputCls}
                      value={householdName}
                      onChange={(e) => setHouseholdName(e.target.value)}
                      placeholder="Sharma Household"
                      autoFocus
                      required
                    />
                  </label>
                  <Button disabled={busy}>{busy ? "Creating…" : "Create & enter"}</Button>
                </form>
              )}

              {error && (
                <p className="rounded-md border border-negative bg-surface px-3 py-2 text-[0.82em] text-negative">
                  {error}
                </p>
              )}

              {/* Footer affordances: back / switch-into-pick / sign out. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[0.82em]">
                {showCreateForm && memberships.length > 0 && (
                  <button
                    onClick={() => {
                      setCreatingHousehold(false);
                      setError(null);
                    }}
                    className="text-text-muted underline underline-offset-4 hover:text-text"
                  >
                    ← Back to workspaces
                  </button>
                )}
                {!signedIn && (
                  <button
                    onClick={backToIdentity}
                    className="text-text-muted underline underline-offset-4 hover:text-text"
                  >
                    {isSupabaseEnabled ? "← Use a different account" : "← Use a different email"}
                  </button>
                )}
                {signedIn && (
                  <button
                    onClick={signOutHere}
                    className="text-text-muted underline underline-offset-4 hover:text-text"
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  // The root layout already wraps the tree in AppProviders (which themes via the
  // active persona), so this page renders inside that scope and inherits tokens.
  return <LoginInner />;
}
