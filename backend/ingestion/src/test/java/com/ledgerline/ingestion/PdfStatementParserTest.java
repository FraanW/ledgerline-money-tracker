package com.ledgerline.ingestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ledgerline.contracts.TransactionDirection;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * M1 PDF statements — the parser is tested against REAL encrypted PDFs built
 * in-memory with PDFBox (no bank fixture files, nothing sensitive on disk).
 *
 * <p>Covers: on-the-fly unlock (right/wrong/missing password), the common
 * Indian tabular layout (running-balance delta direction), explicit Dr/Cr
 * markers, wrapped-description folding, opening-balance seeding, summary-row
 * skipping, per-row errors, and the scanned-PDF guard.
 */
class PdfStatementParserTest {

    private static final String PASSWORD = "ANAY0107";

    private static final List<String> STATEMENT_LINES = List.of(
        "HDFC BANK Statement of Account",
        "Account No: XXXX4821 Period: 01/06/2026 to 30/06/2026",
        "Date Narration Withdrawal Deposit Balance",
        "Opening Balance 50,000.00",
        "01/06/2026 NEFT SALARY ACME JUNE 82,000.00 1,32,000.00",
        "03/06/2026 NEFT RENT TRANSFER TO LANDLORD 20,000.00 1,12,000.00",
        "12/06/2026 POS 416021XXXXXX1234 AMAZON PAY",
        "INDIA PVT LTD MUMBAI 1,499.00 1,10,501.00",
        "15/06/2026 IMPS REFUND FLIPKART 320.00 Cr",
        "Page 1 of 1",
        "Closing Balance 1,10,821.00");

    private final PdfStatementParser parser = new PdfStatementParser();

    // =====================================================================

    @Test
    @DisplayName("encrypted PDF + correct password: unlocked on the fly, rows parsed with delta + Dr/Cr directions")
    void encrypted_pdf_parses_with_password() throws Exception {
        byte[] pdf = buildPdf(STATEMENT_LINES, PASSWORD);

        List<StatementParser.ParsedRow> rows = parser.parse(pdf, PASSWORD);
        List<StatementParser.ParsedRow> ok = rows.stream().filter(StatementParser.ParsedRow::isOk).toList();

        assertThat(ok).hasSize(4);
        assertThat(rows.stream().filter(r -> !r.isOk())).as("no row errors").isEmpty();

        RawStatementRow salary = ok.get(0).row();
        assertThat(salary.postedAt().toString()).isEqualTo("2026-06-01");
        assertThat(salary.rawDescription()).isEqualTo("NEFT SALARY ACME JUNE");
        assertThat(salary.amountMinor()).isEqualTo(8200000L);
        assertThat(salary.direction())
            .as("opening balance 50k -> 1.32L = credit, via balance delta")
            .isEqualTo(TransactionDirection.credit);

        RawStatementRow rent = ok.get(1).row();
        assertThat(rent.direction()).isEqualTo(TransactionDirection.debit);
        assertThat(rent.amountMinor()).isEqualTo(2000000L);

        RawStatementRow amazon = ok.get(2).row();
        assertThat(amazon.rawDescription())
            .as("wrapped description is folded into one row")
            .isEqualTo("POS 416021XXXXXX1234 AMAZON PAY INDIA PVT LTD MUMBAI");
        assertThat(amazon.amountMinor()).isEqualTo(149900L);
        assertThat(amazon.direction()).isEqualTo(TransactionDirection.debit);

        RawStatementRow refund = ok.get(3).row();
        assertThat(refund.direction())
            .as("explicit Cr marker wins (single-amount layout)")
            .isEqualTo(TransactionDirection.credit);
        assertThat(refund.amountMinor()).isEqualTo(32000L);
    }

    @Test
    @DisplayName("wrong password -> clear whole-file error")
    void wrong_password_is_a_clear_error() throws Exception {
        byte[] pdf = buildPdf(STATEMENT_LINES, PASSWORD);
        assertThatThrownBy(() -> parser.parse(pdf, "nope"))
            .isInstanceOf(StatementParseException.class)
            .hasMessageContaining("incorrect PDF password");
    }

    @Test
    @DisplayName("encrypted but no password supplied -> asks for the password")
    void missing_password_asks_for_it() throws Exception {
        byte[] pdf = buildPdf(STATEMENT_LINES, PASSWORD);
        assertThatThrownBy(() -> parser.parse(pdf, null))
            .isInstanceOf(StatementParseException.class)
            .hasMessageContaining("password-protected");
    }

    @Test
    @DisplayName("unencrypted PDF parses without any password")
    void unencrypted_pdf_needs_no_password() throws Exception {
        byte[] pdf = buildPdf(STATEMENT_LINES, null);
        List<StatementParser.ParsedRow> rows = parser.parse(pdf, null);
        assertThat(rows.stream().filter(StatementParser.ParsedRow::isOk)).hasSize(4);
    }

    @Test
    @DisplayName("text-free (scanned-style) PDF -> honest 'scanned' error, not garbage")
    void scanned_pdf_is_rejected_clearly() throws Exception {
        byte[] pdf = buildPdf(List.of(), null); // a page with no text at all
        assertThatThrownBy(() -> parser.parse(pdf, null))
            .isInstanceOf(StatementParseException.class)
            .hasMessageContaining("scanned");
    }

    @Test
    @DisplayName("a row with no usable direction surfaces as a per-row error, not a crash")
    void ambiguous_direction_is_a_row_error() throws Exception {
        byte[] pdf = buildPdf(List.of(
            // No opening balance, no Dr/Cr marker, single amount: undecidable.
            "01/06/2026 MYSTERY TRANSFER 500.00"), null);
        List<StatementParser.ParsedRow> rows = parser.parse(pdf, null);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).isOk()).isFalse();
        assertThat(rows.get(0).error()).contains("cannot determine debit/credit");
    }

    // =====================================================================

    /** Build a (optionally password-protected) single-page PDF of text lines. */
    private static byte[] buildPdf(List<String> lines, String password) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                cs.setLeading(14f);
                cs.newLineAtOffset(40, 800);
                for (String line : lines) {
                    cs.showText(line);
                    cs.newLine();
                }
                cs.endText();
            }
            if (password != null) {
                StandardProtectionPolicy policy =
                    new StandardProtectionPolicy(password, password, new AccessPermission());
                policy.setEncryptionKeyLength(128);
                doc.protect(policy);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }
}
