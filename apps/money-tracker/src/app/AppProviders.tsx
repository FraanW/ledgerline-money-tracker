"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { ThemeProvider } from "../theme/ThemeProvider";
import { THEME_IDS, type ThemeId } from "../theme/tokens";
import { useSession, type Session } from "../lib/session";
import { api } from "../lib/api";
import { supabase, isSupabaseEnabled } from "../lib/supabase";
import { setAccessToken } from "../lib/authToken";

/**
 * App-wide client providers: holds the active persona (design direction) and
 * applies it via ThemeProvider, and exposes a switcher through context. The
 * whole app is themed off one persona at a time; the marketing landing renders
 * inside this but is self-themed (it shows all three), so it ignores the vars.
 *
 * Also exposes the dev session and, when one exists, hydrates the persona from
 * the user's saved preferredTheme (so the app opens in their chosen direction).
 */
interface PersonaCtx {
  persona: ThemeId;
  setPersona: (p: ThemeId) => void;
  personas: readonly ThemeId[];
  session: Session | null;
  sessionReady: boolean;
}

const Ctx = createContext<PersonaCtx>({
  persona: "millennial",
  setPersona: () => {},
  personas: THEME_IDS,
  session: null,
  sessionReady: false,
});

export const usePersona = () => useContext(Ctx);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<ThemeId>("millennial");
  const { session, ready } = useSession();

  // Keep the access-token cache (read synchronously by api.ts) fresh from
  // Supabase: seed it from the persisted session on mount, then track every
  // sign-in / token-refresh / sign-out. No-op when Supabase isn't configured.
  useEffect(() => {
    if (!isSupabaseEnabled || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setAccessToken(sess?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // On mount with a session, pull the saved theme preference and apply it.
  useEffect(() => {
    if (!ready || !session) return;
    let alive = true;
    api.settings
      .getUser()
      .then((s) => {
        if (alive && s?.preferredTheme) setPersona(s.preferredTheme);
      })
      .catch(() => {
        /* keep default persona if settings can't be read */
      });
    return () => {
      alive = false;
    };
  }, [ready, session]);

  return (
    <Ctx.Provider value={{ persona, setPersona, personas: THEME_IDS, session, sessionReady: ready }}>
      <ThemeProvider themeId={persona}>{children}</ThemeProvider>
    </Ctx.Provider>
  );
}
