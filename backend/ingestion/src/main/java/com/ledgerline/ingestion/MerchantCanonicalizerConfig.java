package com.ledgerline.ingestion;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Wires the M3 seam (Sweep 3). One property decides:
 * {@code ledgerline.canonicalizer.url} set → HTTP calls to the Python
 * enrichment service; unset/blank → a no-op that abstains on everything
 * (merchant stays NULL, exactly the pre-Sweep-3 behaviour).
 */
@Configuration
public class MerchantCanonicalizerConfig {

    private static final Logger log = LoggerFactory.getLogger(MerchantCanonicalizerConfig.class);

    @Bean
    @ConditionalOnMissingBean(MerchantCanonicalizer.class)
    public MerchantCanonicalizer merchantCanonicalizer(
        @Value("${ledgerline.canonicalizer.url:}") String url
    ) {
        if (url == null || url.isBlank()) {
            log.info("merchant canonicalizer: DISABLED (ledgerline.canonicalizer.url not set)");
            return raws -> Map.of();
        }
        log.info("merchant canonicalizer: HTTP via {}", url.trim());
        return new HttpMerchantCanonicalizer(url.trim());
    }
}
