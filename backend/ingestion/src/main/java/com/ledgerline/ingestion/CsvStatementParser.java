package com.ledgerline.ingestion;

import com.ledgerline.contracts.TransactionDirection;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

/**
 * The v0 CSV statement parser — handles the canonical Indian-bank statement
 * export shape (HDFC / ICICI / Axis all share enough column-name DNA that one
 * header-name-driven parser covers them).
 *
 * <h2>Canonical CSV shape (v0)</h2>
 * <pre>
 * Date,Description,Debit,Credit
 * 2026-05-01,UPI/BIGBAZAAR/123,1499.50,
 * 2026-05-02,SALARY CREDIT,,50000.00
 * </pre>
 *
 * <p>One of {@code Debit} / {@code Credit} per row is non-blank — that is what
 * encodes the direction. A row with both populated or both blank is a malformed
 * row (per-row {@code error}, not a whole-file failure).
 *
 * <h2>Why Apache Commons CSV (not OpenCSV / Jackson CSV / hand-rolled)</h2>
 * <ul>
 *   <li>Dependency-light (one jar, no transitives).</li>
 *   <li>Header-name access ({@code record.get("Debit")}) so the parser is
 *       resilient to column reordering — the strategy is the SHAPE, not the
 *       order.</li>
 *   <li>Quoted-field + embedded-comma handling we'd otherwise hand-roll badly.</li>
 *   <li>Apache 2.0, well-known, no surprises.</li>
 * </ul>
 *
 * <h2>Money parsing — be defensive</h2>
 * CSVs come in with rupee strings like {@code "1,499.50"}, {@code "1499.5"},
 * {@code "1499"}, or trailing CR + whitespace. We:
 * <ol>
 *   <li>Strip commas + whitespace (Indian grouping is not safe to parse with
 *       {@code Double.parseDouble} regardless).</li>
 *   <li>Parse as {@link BigDecimal} to keep the integer-arithmetic invariant —
 *       NEVER {@code double} in money. Scale to 2 decimals with HALF_UP, then
 *       {@code movePointRight(2).longValueExact()} for paise.</li>
 *   <li>Reject negative magnitudes — the sign lives in the column choice
 *       (Debit vs Credit), not in the number.</li>
 * </ol>
 * Overflow throws {@code ArithmeticException} (no realistic bank statement
 * row hits {@code Long.MAX_VALUE} paise — that is ~92,000 trillion rupees).
 */
public class CsvStatementParser implements StatementParser {

    public static final String FORMAT_ID = "csv.generic-v1";

    private static final String COL_DATE = "Date";
    private static final String COL_DESC = "Description";
    private static final String COL_DEBIT = "Debit";
    private static final String COL_CREDIT = "Credit";

    /**
     * Date formats we accept, tried in order. ISO ({@code yyyy-MM-dd}) is the
     * canonical default; {@code dd/MM/yyyy} is what most Indian bank exports
     * actually emit. We deliberately stop here for v0 — adding more is a
     * one-line change and a regression-tested format-bump.
     */
    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
        DateTimeFormatter.ISO_LOCAL_DATE,
        DateTimeFormatter.ofPattern("dd/MM/yyyy"),
        DateTimeFormatter.ofPattern("dd-MM-yyyy")
    );

    @Override
    public String formatId() {
        return FORMAT_ID;
    }

    @Override
    public List<ParsedRow> parse(InputStream input)
        throws IOException, StatementParseException {

        List<ParsedRow> out = new ArrayList<>();

        // BOM-tolerant reader — Excel-exported CSVs often carry a UTF-8 BOM
        // (EF BB BF) that would otherwise become part of the first header name
        // and break the case-sensitive header lookup. Commons CSV does NOT
        // strip the BOM for you; we wrap the reader and consume it explicitly.
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(input, StandardCharsets.UTF_8));
             CSVParser parser = CSVParser.parse(
                stripBomIfPresent(reader),
                CSVFormat.DEFAULT.builder()
                    .setHeader()
                    .setSkipHeaderRecord(true)
                    .setIgnoreSurroundingSpaces(true)
                    .setIgnoreEmptyLines(true)
                    .setTrim(true)
                    .build())) {

            Set<String> headers = parser.getHeaderMap().keySet();
            requireHeader(headers, COL_DATE);
            requireHeader(headers, COL_DESC);
            requireHeader(headers, COL_DEBIT);
            requireHeader(headers, COL_CREDIT);

            for (CSVRecord record : parser) {
                // CSVRecord.getRecordNumber is 1-based and ignores the header row.
                // Add 1 to surface the actual file line the user would see.
                int lineNumber = (int) record.getRecordNumber() + 1;
                try {
                    RawStatementRow row = toRow(record);
                    out.add(ParsedRow.ok(lineNumber, row));
                } catch (RowParseException rowErr) {
                    out.add(ParsedRow.error(lineNumber, rowErr.getMessage()));
                } catch (RuntimeException unexpected) {
                    // Defensive: anything we did not foresee becomes a per-row
                    // error rather than a 500. One malformed row never poisons
                    // the rest of the file (M1 spec).
                    out.add(ParsedRow.error(
                        lineNumber,
                        "unexpected error: " + unexpected.getClass().getSimpleName()
                            + ": " + unexpected.getMessage()));
                }
            }
        }
        return out;
    }

    /**
     * Peek the first character and discard it if it is the UTF-8 BOM
     * (U+FEFF). Returns the reader either way so the caller can keep using
     * it. {@link BufferedReader#mark}+{@link BufferedReader#reset} is what
     * makes the no-BOM branch a no-op.
     */
    private static BufferedReader stripBomIfPresent(BufferedReader reader) throws IOException {
        // U+FEFF: the Unicode "BOM" code point. After decoding UTF-8 the BOM
        // appears as this single char regardless of the underlying 3-byte
        // EF BB BF sequence on disk.
        reader.mark(1);
        int first = reader.read();
        if (first != 0xFEFF && first != -1) {
            reader.reset();
        }
        return reader;
    }

    private static void requireHeader(Set<String> headers, String name) {
        if (!headers.contains(name)) {
            throw new StatementParseException(
                "Missing required CSV header '" + name + "'. "
                    + "Expected headers: " + COL_DATE + ", " + COL_DESC
                    + ", " + COL_DEBIT + ", " + COL_CREDIT);
        }
    }

    private static RawStatementRow toRow(CSVRecord record) {
        String dateStr = nullSafe(record.get(COL_DATE));
        String desc = nullSafe(record.get(COL_DESC));
        String debit = nullSafe(record.get(COL_DEBIT));
        String credit = nullSafe(record.get(COL_CREDIT));

        if (dateStr.isEmpty()) {
            throw new RowParseException("Date is empty");
        }
        if (desc.isEmpty()) {
            throw new RowParseException("Description is empty");
        }
        boolean hasDebit = !debit.isEmpty();
        boolean hasCredit = !credit.isEmpty();
        if (hasDebit == hasCredit) {
            // Either both blank or both populated: ambiguous direction.
            throw new RowParseException(
                "exactly one of Debit / Credit must be non-blank "
                    + "(got debit='" + debit + "', credit='" + credit + "')");
        }
        LocalDate postedAt = parseDate(dateStr);
        long amountMinor = parseRupeesToMinor(hasDebit ? debit : credit);
        TransactionDirection direction = hasDebit
            ? TransactionDirection.debit
            : TransactionDirection.credit;
        return new RawStatementRow(postedAt, amountMinor, direction, desc);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s.trim();
    }

    private static LocalDate parseDate(String s) {
        for (DateTimeFormatter fmt : DATE_FORMATS) {
            try {
                return LocalDate.parse(s, fmt);
            } catch (DateTimeParseException ignored) {
                // try the next format
            }
        }
        throw new RowParseException(
            "unparseable date '" + s + "' (expected yyyy-MM-dd, dd/MM/yyyy, or dd-MM-yyyy)");
    }

    /**
     * Parse a rupee string into integer paise.
     * Defensive about commas, whitespace, and accidental trailing fragments.
     * Uses {@link BigDecimal} throughout — never a {@code double}.
     */
    static long parseRupeesToMinor(String raw) {
        // Strip Indian-grouping commas and ALL whitespace (a stray CR / NBSP
        // from a copy-paste through Excel would otherwise tank BigDecimal).
        String cleaned = raw.replace(",", "").replaceAll("\\s+", "");
        if (cleaned.isEmpty()) {
            throw new RowParseException("amount is empty after trimming");
        }
        BigDecimal rupees;
        try {
            rupees = new BigDecimal(cleaned);
        } catch (NumberFormatException nfe) {
            throw new RowParseException("unparseable amount '" + raw + "'");
        }
        if (rupees.signum() < 0) {
            // Magnitude is non-negative; sign lives in Debit-vs-Credit column.
            throw new RowParseException(
                "amount must be a non-negative magnitude (got '" + raw
                    + "'); sign belongs in the Debit/Credit column choice");
        }
        // Round HALF_UP to 2 dp (the schema's *_minor BIGINT is exact paise) and
        // shift to integer paise. setScale rejects > 2dp precision losslessly
        // unless HALF_UP is asked for, which is the banking rounding mode.
        BigDecimal paise = rupees.setScale(2, RoundingMode.HALF_UP).movePointRight(2);
        try {
            return paise.longValueExact();
        } catch (ArithmeticException overflow) {
            // No realistic ledger row hits this; surface clearly if it does.
            throw new RowParseException(
                "amount overflows long paise ('" + raw + "')");
        }
    }

    /**
     * Per-row failure marker — caught inside {@link #parse(InputStream)} and
     * turned into a {@code ParsedRow.error}. Private to this file — callers
     * see the structured {@code ParsedRow}, not the exception.
     */
    private static class RowParseException extends RuntimeException {
        RowParseException(String message) {
            super(message);
        }
    }
}
