package com.ledgerline.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * M3 over HTTP — calls the Python canonicalizer service (Sweep 3, ADR-0008):
 * {@code POST {base}/canonicalize/batch} with
 * {@code {"items":[{"raw":"...","merchant_hint":null}, …]}} and reads
 * {@code {"results":[{"raw":…,"canonical":"Swiggy"|null,…}, …]}}.
 * {@code canonical == null} is the service ABSTAINING — we keep that honesty
 * and simply omit the entry.
 *
 * <h2>Fail-open, always</h2>
 * Ingestion must never depend on the enrichment sidecar being up. Any failure
 * — connect refused, timeout, non-200, unparseable body — logs ONE warning
 * and returns an empty map; every transaction then lands with a NULL merchant
 * exactly as before Sweep 3. Timeouts are tight (2s connect / 4s request)
 * because this runs in the upload request path, before the DB transaction.
 */
public class HttpMerchantCanonicalizer implements MerchantCanonicalizer {

    private static final Logger log = LoggerFactory.getLogger(HttpMerchantCanonicalizer.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final URI endpoint;
    private final HttpClient http;

    public HttpMerchantCanonicalizer(String baseUrl) {
        this.endpoint = URI.create(baseUrl.replaceAll("/+$", "") + "/canonicalize/batch");
        this.http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
    }

    @Override
    public Map<String, String> canonicalizeBatch(List<String> rawDescriptions) {
        if (rawDescriptions.isEmpty()) {
            return Map.of();
        }
        try {
            ObjectNode body = JSON.createObjectNode();
            ArrayNode items = body.putArray("items");
            for (String raw : rawDescriptions) {
                ObjectNode item = items.addObject();
                item.put("raw", raw);
                item.putNull("merchant_hint");
            }

            HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(4))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)))
                .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("canonicalizer returned {} — ingesting without merchants", response.statusCode());
                return Map.of();
            }

            JsonNode results = JSON.readTree(response.body()).path("results");
            Map<String, String> resolved = new HashMap<>();
            for (JsonNode r : results) {
                // Match by the echoed `raw` (defensive against ordering drift);
                // a null `canonical` is an abstain — skip it.
                JsonNode canonical = r.path("canonical");
                if (!canonical.isNull() && !canonical.isMissingNode()) {
                    resolved.put(r.path("raw").asText(), canonical.asText());
                }
            }
            if (log.isDebugEnabled()) {
                log.debug("canonicalized {}/{} raw descriptions", resolved.size(), rawDescriptions.size());
            }
            return resolved;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            log.warn("canonicalizer call interrupted — ingesting without merchants");
            return Map.of();
        } catch (Exception failure) {
            log.warn("canonicalizer unavailable ({}: {}) — ingesting without merchants",
                failure.getClass().getSimpleName(), failure.getMessage());
            return Map.of();
        }
    }
}
