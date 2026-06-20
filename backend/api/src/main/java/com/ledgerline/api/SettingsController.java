package com.ledgerline.api;

import com.ledgerline.platform.db.TenantContext;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/**
 * Settings — the endpoint that finally makes the persona PERSIST (V8).
 *
 * <pre>
 * GET /api/v0/settings/user      (X-User-Id only — self-scoped RLS)
 * PUT /api/v0/settings/user      {preferredTheme, locale, logRemindersEnabled, spendingAlertsEnabled}
 * GET /api/v0/settings/tenant    (settings:read)
 * PUT /api/v0/settings/tenant    {monthlyRolloverEnabled}   (settings:write)
 * </pre>
 *
 * User settings run under {@code withUser} (the {@code app.current_user_id}
 * GUC drives the V8 self-only policy); the GET upserts the default row so a
 * fresh user always gets an answer.
 */
@RestController
public class SettingsController {

    private static final Set<String> THEMES = Set.of("genz", "millennial", "senior");

    private final ApiGate gate;
    private final TenantContext tenantContext;

    public SettingsController(ApiGate gate, TenantContext tenantContext) {
        this.gate = gate;
        this.tenantContext = tenantContext;
    }

    public record UserSettingsBody(
        String preferredTheme, String locale, Boolean logRemindersEnabled, Boolean spendingAlertsEnabled) {}

    public record TenantSettingsBody(Boolean monthlyRolloverEnabled) {}

    // ---------- user settings (self-scoped) ----------

    @GetMapping(value = "/api/v0/settings/user", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> getUserSettings(
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        UUID userId = gate.requireUser(userHeader);
        return tenantContext.withUser(userId, (JdbcTemplate jdbc) -> {
            jdbc.update(
                "INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING",
                userId);
            return jdbc.queryForObject(
                """
                SELECT preferred_theme::text AS theme, locale, log_reminders_enabled, spending_alerts_enabled
                FROM user_settings WHERE user_id = ?
                """,
                (rs, i) -> Map.of(
                    "preferredTheme", rs.getString("theme"),
                    "locale", rs.getString("locale"),
                    "logRemindersEnabled", rs.getBoolean("log_reminders_enabled"),
                    "spendingAlertsEnabled", rs.getBoolean("spending_alerts_enabled")),
                userId);
        });
    }

    @PutMapping(
        value = "/api/v0/settings/user",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> putUserSettings(
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody UserSettingsBody body
    ) {
        UUID userId = gate.requireUser(userHeader);
        if (body.preferredTheme() != null && !THEMES.contains(body.preferredTheme())) {
            throw new ApiException.BadRequest("preferredTheme must be one of " + THEMES);
        }
        tenantContext.withUser(userId, (JdbcTemplate jdbc) -> {
            jdbc.update(
                "INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING",
                userId);
            jdbc.update(
                """
                UPDATE user_settings
                SET preferred_theme         = COALESCE(?::persona_theme, preferred_theme),
                    locale                  = COALESCE(?, locale),
                    log_reminders_enabled   = COALESCE(?, log_reminders_enabled),
                    spending_alerts_enabled = COALESCE(?, spending_alerts_enabled),
                    updated_at              = now()
                WHERE user_id = ?
                """,
                body.preferredTheme(), body.locale(),
                body.logRemindersEnabled(), body.spendingAlertsEnabled(),
                userId);
        });
        return getUserSettings(userHeader);
    }

    // ---------- tenant settings (workspace-wide) ----------

    @GetMapping(value = "/api/v0/settings/tenant", produces = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> getTenantSettings(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "settings:read");
        return tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            jdbc.update(
                "INSERT INTO tenant_settings (tenant_id) VALUES (?) ON CONFLICT (tenant_id) DO NOTHING",
                scope.tenantId());
            return jdbc.queryForObject(
                """
                SELECT monthly_rollover_enabled, default_currency::text AS currency
                FROM tenant_settings WHERE tenant_id = ?
                """,
                (rs, i) -> Map.of(
                    "monthlyRolloverEnabled", rs.getBoolean("monthly_rollover_enabled"),
                    "defaultCurrency", rs.getString("currency")),
                scope.tenantId());
        });
    }

    @PutMapping(
        value = "/api/v0/settings/tenant",
        consumes = MediaType.APPLICATION_JSON_VALUE,
        produces = MediaType.APPLICATION_JSON_VALUE
    )
    public Map<String, Object> putTenantSettings(
        @RequestHeader(value = "X-Tenant-Id", required = false) String tenantHeader,
        @RequestHeader(value = "X-User-Id", required = false) String userHeader,
        @RequestBody TenantSettingsBody body
    ) {
        ApiGate.Scope scope = gate.require(tenantHeader, userHeader, "settings:write");
        tenantContext.withTenantAndUser(scope.tenantId(), scope.userId(), (JdbcTemplate jdbc) -> {
            jdbc.update(
                "INSERT INTO tenant_settings (tenant_id) VALUES (?) ON CONFLICT (tenant_id) DO NOTHING",
                scope.tenantId());
            jdbc.update(
                """
                UPDATE tenant_settings
                SET monthly_rollover_enabled = COALESCE(?, monthly_rollover_enabled),
                    updated_at = now()
                WHERE tenant_id = ?
                """,
                body.monthlyRolloverEnabled(), scope.tenantId());
        });
        return getTenantSettings(tenantHeader, userHeader);
    }
}
