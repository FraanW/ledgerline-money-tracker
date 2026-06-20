package com.ledgerline.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

/**
 * Ledgerline backend entrypoint.
 *
 * <p>On boot Spring Boot auto-configures the {@code DataSource} (from
 * {@code SPRING_DATASOURCE_*} / {@code DATABASE_URL}), runs Flyway against it
 * (applying V1-V3), and starts the web server with an Actuator health endpoint.
 *
 * <p>{@link ComponentScan} is widened to {@code com.ledgerline} so the
 * {@code platform-db} module's {@code TenantContext} component is picked up
 * without each module needing its own auto-configuration wiring.
 */
@SpringBootApplication
@ComponentScan(basePackages = "com.ledgerline")
public class LedgerlineApplication {

    public static void main(String[] args) {
        SpringApplication.run(LedgerlineApplication.class, args);
    }
}
