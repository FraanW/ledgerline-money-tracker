package com.ledgerline.ingestion;

import com.ledgerline.contracts.Transaction;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;

/**
 * The v0 default publisher: a no-op. M1 ships without M4; M11 and M12 are not
 * yet wired downstream of upload. When M4 arrives, a real implementation will
 * register a bean of type {@link IngestionEventPublisher} and this no-op will
 * step aside via {@link ConditionalOnMissingBean}.
 *
 * <p>The no-op DOES log a single line per ingested transaction at TRACE so
 * that during development you can see the seam firing without it becoming
 * console noise.
 */
@Configuration
public class NoOpIngestionEventPublisher {

    private static final org.slf4j.Logger log =
        org.slf4j.LoggerFactory.getLogger("ingestion.noop-publisher");

    @Bean(name = "noOpIngestionEventPublisherBean")
    @ConditionalOnMissingBean(IngestionEventPublisher.class)
    public IngestionEventPublisher noOpIngestionEventPublisherBean() {
        return transaction -> {
            // No-op in v0. M4 will write to the outbox table here, in the
            // SAME transaction as the insert. Left as TRACE so the seam is
            // visible during dev but does not spam the logs.
            if (log.isTraceEnabled()) {
                log.trace("ingested (no-op publish) tenant={} txn={} dedup={}",
                    transaction.tenantId(), transaction.id(), transaction.dedupHash());
            }
        };
    }
}
