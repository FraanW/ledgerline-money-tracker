"use client";

import { useEffect, useState } from "react";

/**
 * Dev session. Real auth (Supabase) replaces this — for now we stash the
 * identity ids the backend handed us (real UUIDs) in localStorage so every API
 * call can attach the X-Tenant-Id / X-User-Id headers. There is no token; this
 * is a development affordance only.
 */
export interface Session {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  tenantName: string;
}

const KEY = "ll-session";

/** Read the current session (null on the server or when signed out). */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s || !s.userId || !s.tenantId) return null;
    return s;
  } catch {
    return null;
  }
}

/** Persist a session and notify same-tab listeners. */
export function setSession(s: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  // localStorage 'storage' events don't fire in the same tab — dispatch our own.
  window.dispatchEvent(new Event("ll-session-change"));
}

/** Clear the session (sign out). */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("ll-session-change"));
}

/**
 * Reactive session hook. `ready` is false until the first client read completes
 * (so guards don't redirect during SSR/hydration). Re-reads on session change.
 */
export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSessionState(getSession());
    sync();
    setReady(true);
    window.addEventListener("ll-session-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ll-session-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { session, ready };
}
