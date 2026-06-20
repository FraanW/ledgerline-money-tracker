package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ledgerline.contracts.TransactionDirection;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pure-Java parser tests — no DB. Exercises:
 *
 * <ul>
 *   <li>A representative HDFC/ICICI/Axis-style CSV parses into normalised rows
 *       with the right direction, integer paise, and date.</li>
 *   <li>One malformed row in the middle of a good file becomes a per-row error
 *       and does NOT poison the rest of the file.</li>
 *   <li>A whole-file failure (missing required header) throws
 *       {@link StatementParseException}.</li>
 *   <li>Rupee → paise conversion is integer arithmetic — never floats.</li>
 * </ul>
 */
class CsvStatementParserTest {

    private final CsvStatementParser parser = new CsvStatementParser();

    @Test
    @DisplayName("representative CSV: mix of debits + credits parses into normalised rows")
    void happy_path_parses_mixed_debits_and_credits() throws IOException {
        // Two debits, one credit, dd/MM/yyyy date variant, Indian comma grouping.
        String csv = """
            Date,Description,Debit,Credit
            01/05/2026,UPI/BIGBAZAAR/123,"1,499.50",
            02-05-2026,SALARY CREDIT,,"50,000.00"
            2026-05-03,UPI/SWIGGY/abc,250.00,
            """;

        List<StatementParser.ParsedRow> rows = parse(csv);

        assertThat(rows).hasSize(3);
        assertThat(rows).allMatch(StatementParser.ParsedRow::isOk);

        RawStatementRow first = rows.get(0).row();
        assertThat(first.postedAt()).isEqualTo(LocalDate.of(2026, 5, 1));
        assertThat(first.amountMinor()).isEqualTo(149_950L);
        assertThat(first.direction()).isEqualTo(TransactionDirection.debit);
        assertThat(first.rawDescription()).isEqualTo("UPI/BIGBAZAAR/123");

        RawStatementRow second = rows.get(1).row();
        assertThat(second.postedAt()).isEqualTo(LocalDate.of(2026, 5, 2));
        assertThat(second.amountMinor()).isEqualTo(5_000_000L);
        assertThat(second.direction()).isEqualTo(TransactionDirection.credit);

        RawStatementRow third = rows.get(2).row();
        assertThat(third.postedAt()).isEqualTo(LocalDate.of(2026, 5, 3));
        assertThat(third.amountMinor()).isEqualTo(25_000L);
        assertThat(third.direction()).isEqualTo(TransactionDirection.debit);
    }

    @Test
    @DisplayName("one malformed row in the middle: the rest still parse, the bad one surfaces in errors")
    void mixed_csv_with_one_malformed_row_does_not_poison_the_rest() throws IOException {
        // Row 2 (file line 3) has BOTH Debit and Credit populated — ambiguous direction.
        String csv = """
            Date,Description,Debit,Credit
            2026-05-01,UPI/GOODROW,100.00,
            2026-05-02,UPI/AMBIGUOUS,50.00,75.00
            2026-05-03,UPI/ANOTHER GOOD,200.00,
            """;

        List<StatementParser.ParsedRow> rows = parse(csv);

        assertThat(rows).hasSize(3);
        assertThat(rows.get(0).isOk()).isTrue();
        assertThat(rows.get(1).isOk()).isFalse();
        assertThat(rows.get(1).error()).contains("exactly one of Debit / Credit");
        assertThat(rows.get(2).isOk()).isTrue();
    }

    @Test
    @DisplayName("missing required header is a whole-file failure (throws)")
    void missing_required_header_throws() {
        // No "Credit" column at all -> we cannot even establish the row stream.
        String csv = """
            Date,Description,Debit
            2026-05-01,UPI/BIGBAZAAR/123,100.00
            """;

        assertThatThrownBy(() -> parse(csv))
            .isInstanceOf(StatementParseException.class)
            .hasMessageContaining("Credit");
    }

    @Test
    @DisplayName("BOM-prefixed Excel-exported CSV still finds the headers")
    void bom_prefixed_csv_parses() throws IOException {
        // UTF-8 BOM (EF BB BF) before "Date" — Excel-saved CSVs often have this.
        byte[] bom = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        String body = "Date,Description,Debit,Credit\n2026-05-01,UPI/BIGBAZAAR/123,100.00,\n";
        byte[] full = new byte[bom.length + body.getBytes(StandardCharsets.UTF_8).length];
        System.arraycopy(bom, 0, full, 0, bom.length);
        System.arraycopy(body.getBytes(StandardCharsets.UTF_8), 0, full, bom.length,
            body.getBytes(StandardCharsets.UTF_8).length);

        List<StatementParser.ParsedRow> rows =
            parser.parse(new ByteArrayInputStream(full));
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).isOk()).isTrue();
        assertThat(rows.get(0).row().amountMinor()).isEqualTo(10_000L);
    }

    @Test
    @DisplayName("rupees -> paise conversion is exact integer arithmetic")
    void rupee_to_paise_conversion_is_exact() {
        // 0.1 + 0.2 != 0.3 in double; ensure BigDecimal path is correct.
        assertThat(CsvStatementParser.parseRupeesToMinor("0.10")).isEqualTo(10L);
        assertThat(CsvStatementParser.parseRupeesToMinor("0.20")).isEqualTo(20L);
        assertThat(CsvStatementParser.parseRupeesToMinor("0.30")).isEqualTo(30L);
        assertThat(CsvStatementParser.parseRupeesToMinor("1,499.50")).isEqualTo(149_950L);
        assertThat(CsvStatementParser.parseRupeesToMinor("50000")).isEqualTo(5_000_000L);
        // HALF_UP rounding at exactly 2 dp boundary.
        assertThat(CsvStatementParser.parseRupeesToMinor("1.005")).isEqualTo(101L);
        // Negative magnitudes are rejected (sign lives in column choice).
        assertThatThrownBy(() -> CsvStatementParser.parseRupeesToMinor("-10.00"))
            .hasMessageContaining("non-negative magnitude");
    }

    @Test
    @DisplayName("empty file (header only) parses to zero rows, no error")
    void header_only_file_parses_to_zero_rows() throws IOException {
        String csv = "Date,Description,Debit,Credit\n";
        List<StatementParser.ParsedRow> rows = parse(csv);
        assertThat(rows).isEmpty();
    }

    @Test
    @DisplayName("parser exposes a stable formatId for the strategy seam")
    void format_id_is_stable() {
        assertThat(parser.formatId()).isEqualTo(CsvStatementParser.FORMAT_ID);
    }

    private List<StatementParser.ParsedRow> parse(String csv) throws IOException {
        return parser.parse(new ByteArrayInputStream(csv.getBytes(StandardCharsets.UTF_8)));
    }
}
