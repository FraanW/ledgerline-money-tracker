package com.ledgerline.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/**
 * Regression for commit 3a9313c — the CORS preflight that broke every browser
 * call after the auth cutover.
 *
 * <p>The trap: any fetch carrying a bearer token triggers a preflight that
 * NAMES {@code authorization} in {@code Access-Control-Request-Headers}. Spring
 * 403s ("Invalid CORS request") any preflight header not on the allow-list, and
 * before the fix {@code Authorization} was missing from {@link ApiCorsConfig} —
 * so the browser saw "backend unreachable" while curl (no preflight) worked.
 *
 * <p>{@code :api} is a LIBRARY module (the {@code @SpringBootApplication} lives
 * in {@code :app}), so a Boot {@code @WebMvcTest} slice can't find a
 * {@code @SpringBootConfiguration}. Instead we stand up a plain MVC web context
 * ({@code @EnableWebMvc} + the REAL {@link ApiCorsConfig} {@code WebMvcConfigurer})
 * — which standalone MockMvc would NOT apply — and preflight a {@code /api/**}
 * route. Revert the fix and {@link #preflight_with_authorization_header_allowed}
 * goes red (403 + no allow-headers). The companion test pins the negative side.
 */
@SpringJUnitWebConfig(ApiCorsPreflightTest.CorsTestConfig.class)
class ApiCorsPreflightTest {

    private static final String ORIGIN = "http://localhost:3000";

    private MockMvc mvc;

    @BeforeEach
    void setUp(WebApplicationContext wac) {
        this.mvc = webAppContextSetup(wac).build();
    }

    @Test
    @DisplayName("OPTIONS preflight naming `authorization` from the dev origin is ALLOWED (3a9313c)")
    void preflight_with_authorization_header_allowed() throws Exception {
        mvc.perform(options("/api/v0/probe")
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization"))
            .andExpect(status().isOk())
            .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
            // Spring echoes the allowed request headers; Authorization must be in it.
            .andExpect(header().stringValues(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS,
                org.hamcrest.Matchers.hasItem(
                    org.hamcrest.Matchers.containsStringIgnoringCase("authorization"))));
    }

    @Test
    @DisplayName("a preflight naming an UN-listed header is rejected (the allow-list is real, not a wildcard)")
    void preflight_with_unlisted_header_rejected() throws Exception {
        mvc.perform(options("/api/v0/probe")
                .header(HttpHeaders.ORIGIN, ORIGIN)
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "x-totally-made-up"))
            .andExpect(status().isForbidden());
    }

    /**
     * A throwaway endpoint that exists only so the dispatcher has a {@code /api/**}
     * route to preflight against — the CORS config, not this handler, is the SUT.
     */
    @RestController
    static class CorsProbeController {
        @GetMapping("/api/v0/probe")
        String probe() {
            return "ok";
        }
    }

    /** Minimal MVC context: real CORS config + the probe route, no Boot needed. */
    @Configuration
    @EnableWebMvc
    @Import({ApiCorsConfig.class, CorsProbeController.class})
    static class CorsTestConfig {
    }
}
