"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { usePersona } from "../app/AppProviders";
import { api } from "../lib/api";
import { clearSession } from "../lib/session";
import { supabase, isSupabaseEnabled } from "../lib/supabase";
import { setAccessToken } from "../lib/authToken";
import type { ThemeId } from "../theme/tokens";

/**
 * Responsive app chrome: a left sidebar on desktop that collapses to a top bar
 * + bottom tab nav on mobile. Token-driven; real Next routes; a persona switcher
 * flips the whole app's design direction. Content goes in `children`.
 */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  name: string; // semantic icon name (Lucide), persona-aware
  emoji: string; // Gen-Z fallback glyph
}

export const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", name: "dashboard", emoji: "📊" },
  { key: "philosophies", label: "Philosophies", href: "/philosophies", name: "brain", emoji: "🧭" },
  { key: "log", label: "Log", href: "/log", name: "log", emoji: "📝" },
  { key: "transactions", label: "Transactions", href: "/transactions", name: "transactions", emoji: "🧾" },
  { key: "budget", label: "Budget", href: "/budget", name: "budget", emoji: "💸" },
  { key: "investments", label: "Invest", href: "/investments", name: "invest", emoji: "💹" },
  { key: "networth", label: "Net worth", href: "/networth", name: "networth", emoji: "⚖️" },
  { key: "insights", label: "Insights", href: "/insights", name: "insights", emoji: "📈" },
  { key: "tags", label: "Tags", href: "/tags", name: "tags", emoji: "🏷️" },
  { key: "settings", label: "Settings", href: "/settings", name: "settings", emoji: "⚙️" },
];

const PERSONA_LABEL: Record<ThemeId, string> = { genz: "Gen Z", millennial: "Millennial", senior: "Senior" };

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-md text-accent-contrast" style={{ background: "var(--ml-gradient-accent)" }}>₹</span>
      <span className="font-display text-[1.05em] font-bold text-text">Money Tracker</span>
    </Link>
  );
}

function PersonaSwitcher() {
  const { persona, setPersona, personas, session } = usePersona();
  const choose = (p: ThemeId) => {
    setPersona(p); // optimistic
    if (session) {
      api.settings.updateUser({ preferredTheme: p }).catch(() => {
        /* keep the optimistic switch even if the save fails */
      });
    }
  };
  return (
    <div className="rounded-md border border-border bg-surface-raised p-2">
      <div className="mb-1.5 px-1 text-[0.66em] uppercase tracking-wide text-text-muted">Design direction</div>
      <div className="flex gap-1">
        {personas.map((p) => {
          const on = p === persona;
          return (
            <button
              key={p}
              onClick={() => choose(p)}
              className="flex-1 rounded-sm px-2 py-1 text-[0.72em] font-medium transition-colors"
              style={{
                background: on ? "var(--ml-color-accent)" : "transparent",
                color: on ? "var(--ml-color-accent-contrast)" : "var(--ml-color-text-muted)",
                cursor: "pointer",
                transitionDuration: "var(--ml-motion-fast)",
              }}
            >
              {PERSONA_LABEL[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ active = "dashboard", children }: { active?: string; children: React.ReactNode }) {
  const router = useRouter();
  const { session, sessionReady } = usePersona();

  // Session guard: data surfaces require a session. The public landing (`/`) and
  // `/philosophies*` render their own chrome and never mount AppShell, so this
  // only fires on app pages. Wait until the session has actually been read on the
  // client (sessionReady) before deciding, to avoid an SSR/hydration false redirect.
  useEffect(() => {
    if (sessionReady && !session) router.replace("/login");
  }, [sessionReady, session, router]);

  if (!sessionReady || !session) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg text-text-muted">
        <span className="text-[0.9em]">Loading…</span>
      </div>
    );
  }

  const onLogout = () => {
    if (isSupabaseEnabled && supabase) {
      supabase.auth.signOut().catch(() => {
        /* clear locally regardless of the network call */
      });
    }
    setAccessToken(null);
    clearSession();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Mobile top bar — avatar opens /login to switch workspace (which also
          exposes sign-out), so a single tap covers both. */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <Brand />
        <Link
          href="/login"
          aria-label={`${session.displayName} · ${session.tenantName} — switch workspace`}
          className="grid h-9 w-9 place-items-center rounded-full bg-surface-raised text-text"
        >
          {(session.displayName.trim()[0] ?? "A").toUpperCase()}
        </Link>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface p-4 lg:flex">
          <div className="mb-6">
            <Brand />
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => {
              const on = n.key === active;
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-[0.95em] transition-colors hover:bg-surface-raised"
                  style={{
                    background: on ? "var(--ml-color-surface-raised)" : "transparent",
                    color: on ? "var(--ml-color-accent)" : "var(--ml-color-text)",
                    boxShadow: on ? "inset 3px 0 0 var(--ml-color-accent)" : undefined,
                    fontWeight: on ? 650 : 400,
                    transitionDuration: "var(--ml-motion-fast)",
                  }}
                >
                  <Icon name={n.name} emoji={n.emoji} size={18} />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3">
            <PersonaSwitcher />
            <div className="rounded-md border border-border bg-surface-raised p-3">
              {/* Session chip: name + workspace; click to switch workspace. */}
              <Link
                href="/login"
                className="group flex items-center justify-between gap-2 transition-colors"
                aria-label="Switch workspace"
              >
                <div className="min-w-0">
                  <div className="truncate text-[0.85em] font-medium text-text">{session.displayName}</div>
                  <div className="truncate text-[0.75em] text-text-muted">{session.tenantName}</div>
                </div>
                <span className="shrink-0 text-[0.7em] text-text-muted transition-colors group-hover:text-accent">
                  Switch
                </span>
              </Link>
              <button onClick={onLogout} className="mt-2 text-[0.78em] text-accent underline underline-offset-4">
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-surface px-2 py-2 lg:hidden">
        {NAV.slice(0, 5).map((n) => {
          const on = n.key === active;
          return (
            <Link key={n.key} href={n.href} className="flex flex-col items-center gap-0.5 px-2 py-1 text-[0.68em]" style={{ color: on ? "var(--ml-color-accent)" : "var(--ml-color-text-muted)" }}>
              <Icon name={n.name} emoji={n.emoji} size={20} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
