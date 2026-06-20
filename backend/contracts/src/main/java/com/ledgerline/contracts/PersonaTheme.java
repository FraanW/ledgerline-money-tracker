package com.ledgerline.contracts;

/**
 * Mirror of the {@code persona_theme} enum (migration V8) — the Money Tracker
 * design direction a user prefers. Persisted in {@code user_settings} so the
 * persona no longer resets on page reload.
 */
public enum PersonaTheme {
    genz,
    millennial,
    senior
}
