package com.ledgerline.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS for the browser app (Sweep 2). The Next.js dev server runs on
 * localhost:3000 (and demos ride ngrok), while this backend serves :8090 —
 * without these headers the browser refuses every cross-origin call.
 *
 * <p>Scoped to {@code /api/**} and to the known dev/demo origins — NOT a
 * wildcard. The custom identity headers must be listed or preflight fails.
 */
@Configuration
public class ApiCorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOriginPatterns(
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "https://*.ngrok-free.app")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            // Authorization is REQUIRED here: any request carrying a bearer
            // token triggers a preflight naming it, and Spring 403s
            // ("Invalid CORS request") any header not on this list — which
            // reads in the browser as "backend unreachable".
            .allowedHeaders("Content-Type", "Authorization", "X-Tenant-Id", "X-User-Id")
            .maxAge(3600);
    }
}
