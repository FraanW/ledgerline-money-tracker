"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase auth client — the real front door.
 *
 * We read the two public Supabase vars at module load. When BOTH are present we
 * stand up a browser client and `isSupabaseEnabled` is true (production auth).
 * When either is absent — a fresh clone with no keys — `supabase` is `null` and
 * the app falls back to the dev sign-in flow. The login page and AppProviders
 * branch on `isSupabaseEnabled`, so a keyless clone still works end-to-end.
 *
 * Only the access token matters to our backend: it verifies the bearer on every
 * endpoint. We keep the session in localStorage (the supabase-js default) and
 * mirror the live access token into a tiny cache (authToken.ts) that api.ts
 * reads synchronously — see AppProviders for the wiring.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
