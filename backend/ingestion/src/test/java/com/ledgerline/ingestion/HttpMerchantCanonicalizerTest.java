package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Sweep 3 — the M3 HTTP client. A throwaway in-JVM HttpServer plays the
 * Python canonicalizer; the contract under test:
 * <ul>
 *   <li>accepted results map raw → canonical; abstains (null) are OMITTED;</li>
 *   <li>every failure mode (non-200, garbage body, connection refused) fails
 *       OPEN with an empty map — ingestion never breaks.</li>
 * </ul>
 */
class HttpMerchantCanonicalizerTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    @DisplayName("accepted matches are mapped by raw; abstains (canonical=null) are omitted")
    void maps_accepts_and_omits_abstains() throws IOException {
        AtomicReference<String> received = new AtomicReference<>();
        String body = """
            {"results":[
              {"raw":"UPI/SWIGGY/220011","normalized":"swiggy","canonical":"Swiggy","category":"Dining","confidence":0.97,"method":"exact","candidates":[]},
              {"raw":"UPI/MYSTERY/1","normalized":"mystery","canonical":null,"category":null,"confidence":0.21,"method":"abstain","candidates":[]}
            ]}""";
        startServer(200, body, received);

        MerchantCanonicalizer canon = new HttpMerchantCanonicalizer(baseUrl());
        Map<String, String> out = canon.canonicalizeBatch(
            List.of("UPI/SWIGGY/220011", "UPI/MYSTERY/1"));

        assertThat(out).containsExactlyEntriesOf(Map.of("UPI/SWIGGY/220011", "Swiggy"));
        assertThat(received.get())
            .as("request carries the items array with raw + merchant_hint")
            .contains("\"items\"")
            .contains("UPI/SWIGGY/220011")
            .contains("\"merchant_hint\":null");
    }

    @Test
    @DisplayName("non-200 from the service fails OPEN (empty map)")
    void non_200_fails_open() throws IOException {
        startServer(500, "{\"detail\":\"boom\"}", new AtomicReference<>());
        MerchantCanonicalizer canon = new HttpMerchantCanonicalizer(baseUrl());
        assertThat(canon.canonicalizeBatch(List.of("X"))).isEmpty();
    }

    @Test
    @DisplayName("garbage body fails OPEN (empty map)")
    void garbage_body_fails_open() throws IOException {
        startServer(200, "not json at all", new AtomicReference<>());
        MerchantCanonicalizer canon = new HttpMerchantCanonicalizer(baseUrl());
        assertThat(canon.canonicalizeBatch(List.of("X"))).isEmpty();
    }

    @Test
    @DisplayName("connection refused fails OPEN (empty map)")
    void connection_refused_fails_open() {
        // Nothing listening on this port (we never start a server).
        MerchantCanonicalizer canon = new HttpMerchantCanonicalizer("http://127.0.0.1:1");
        assertThat(canon.canonicalizeBatch(List.of("X"))).isEmpty();
    }

    @Test
    @DisplayName("empty input short-circuits without any HTTP call")
    void empty_input_short_circuits() {
        MerchantCanonicalizer canon = new HttpMerchantCanonicalizer("http://127.0.0.1:1");
        assertThat(canon.canonicalizeBatch(List.of())).isEmpty();
    }

    // ---------------------------------------------------------------------

    private void startServer(int status, String responseBody, AtomicReference<String> received)
        throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/canonicalize/batch", exchange -> {
            received.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] bytes = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }
}
