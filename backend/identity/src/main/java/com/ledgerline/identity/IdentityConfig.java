package com.ledgerline.identity;

import com.ledgerline.platform.db.TenantContext;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * Wires {@link IdentityService} to a DEDICATED control-plane connection.
 *
 * <p>The split that makes RLS honest (closes the ADR-0011 follow-up):
 * <ul>
 *   <li><b>Runtime pool</b> (Spring's primary DataSource) connects as the
 *       non-superuser {@code ledgerline_app} — every tenant-scoped query is
 *       RLS-enforced for real, in dev exactly like prod.</li>
 *   <li><b>Control plane</b> (this DataSource) connects as the owner role for
 *       the few privileged operations: provisioning {@code users} rows,
 *       cross-tenant membership listing at login. Defaults reuse the runtime
 *       JDBC URL with the owner credentials; override per environment via
 *       {@code ledgerline.control-plane.*}.</li>
 * </ul>
 *
 * <p>{@link DriverManagerDataSource} (no pool) is deliberate: control-plane
 * calls are rare (sign-in, workspace create), so one short-lived connection
 * per call beats holding privileged connections open in a pool.
 */
@Configuration
public class IdentityConfig {

    @Bean
    public IdentityService identityService(
        @Value("${ledgerline.control-plane.url:${spring.datasource.url}}") String url,
        @Value("${ledgerline.control-plane.username:ledgerline}") String username,
        @Value("${ledgerline.control-plane.password:ledgerline}") String password,
        TenantContext tenantContext
    ) {
        DriverManagerDataSource controlPlane = new DriverManagerDataSource();
        controlPlane.setDriverClassName("org.postgresql.Driver");
        controlPlane.setUrl(url);
        controlPlane.setUsername(username);
        controlPlane.setPassword(password);
        DataSource ds = controlPlane;
        return new IdentityService(new DataSourceTransactionManager(ds), ds, tenantContext);
    }
}
