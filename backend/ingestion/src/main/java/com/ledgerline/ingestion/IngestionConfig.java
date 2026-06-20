package com.ledgerline.ingestion;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Spring wiring for the ingestion module.
 *
 * <p>Registers the default {@link CsvStatementParser} as the {@link StatementParser}
 * bean. The {@link ConditionalOnMissingBean} guard makes future parsers
 * (PDF, AA adapter at v1) a drop-in: if a config registers another bean
 * implementing {@link StatementParser}, our default steps aside.
 *
 * <p>The {@link IngestionService} and {@link StatementIngestionController}
 * carry {@code @Service} / {@code @RestController} so they are picked up by
 * the umbrella component scan in {@code LedgerlineApplication}; no further
 * registration is needed here.
 */
@Configuration
public class IngestionConfig {

    @Bean
    @ConditionalOnMissingBean(StatementParser.class)
    public StatementParser defaultCsvStatementParser() {
        return new CsvStatementParser();
    }
}
