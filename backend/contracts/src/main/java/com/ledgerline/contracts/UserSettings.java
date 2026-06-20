package com.ledgerline.contracts;

import java.time.Instant;
import java.util.UUID;

/**
 * Mirror of the {@code user_settings} table (migration V8) — per-USER UI and
 * notification preferences that follow the user across every tenant. RLS is
 * self-only (keyed on the {@code app.current_user_id} GUC).
 */
public record UserSettings(
    UUID userId,
    PersonaTheme preferredTheme,
    String locale,
    boolean logRemindersEnabled,
    boolean spendingAlertsEnabled,
    Instant updatedAt
) {}
