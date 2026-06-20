/**
 * Module-level access-token cache.
 *
 * api.ts is synchronous by design — `identityHeaders()` runs on every call and
 * cannot await `supabase.auth.getSession()`. So we keep the live Supabase access
 * token here, in a plain module variable, and let AppProviders keep it fresh
 * (initial `getSession()` + `onAuthStateChange`). api.ts reads it synchronously.
 *
 * In dev mode (no Supabase) the token stays `null` and api.ts sends the legacy
 * X-User-Id / X-Tenant-Id headers — exactly as before.
 */

let accessToken: string | null = null;

/** The current Supabase access token, or null in dev mode / signed out. */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Set (or clear, with `null`) the cached access token. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}
