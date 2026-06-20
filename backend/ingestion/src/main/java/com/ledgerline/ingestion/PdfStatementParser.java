package com.ledgerline.ingestion;

import com.ledgerline.contracts.TransactionDirection;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.text.PDFTextStripper;

/**
 * M1 — PDF bank-statement parser (Sweep 4 opener). Indian banks mail
 * statements as PASSWORD-PROTECTED PDFs; the user supplies the password and
 * we unlock on the fly — the password lives in memory for the duration of
 * the request, is never persisted, and never logged.
 *
 * <h2>What v0 understands</h2>
 * Text-based tabular statements of the common shape
 * {@code Date | Description | (Withdrawal/Deposit or Amount Dr/Cr) | Balance}:
 * <ul>
 *   <li>a transaction row STARTS with a date ({@code dd/MM/yyyy},
 *       {@code dd-MM-yyyy}, 2- or 4-digit year, {@code dd MMM yyyy},
 *       {@code yyyy-MM-dd});</li>
 *   <li>continuation lines (wrapped descriptions) are folded into the row
 *       above, unless they look like page furniture;</li>
 *   <li>direction comes from an explicit {@code Dr}/{@code Cr} marker when
 *       present, else from the RUNNING-BALANCE DELTA (the robust trick for
 *       Indian statements with separate withdrawal/deposit columns);</li>
 *   <li>summary rows (opening/closing balance, totals, B/F, C/F) are
 *       skipped; rows we cannot parse surface as per-row errors — the same
 *       honest contract the CSV path has.</li>
 * </ul>
 * Scanned/image-only PDFs have no extractable text → a clear
 * {@link StatementParseException} ("appears to be scanned"), not garbage.
 */
public final class PdfStatementParser {

    /** A date at the START of a line marks a transaction row. */
    private static final Pattern LEADING_DATE = Pattern.compile(
        "^(\\d{2}[/-]\\d{2}[/-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|\\d{2} [A-Za-z]{3},? \\d{4})\\b");

    /** Indian-format amounts: 1,23,456.78 — optionally suffixed Dr/Cr. */
    private static final Pattern AMOUNT = Pattern.compile(
        "(\\d[\\d,]*\\.\\d{2})\\s*(Dr|DR|dr|Cr|CR|cr)?\\b");

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
        DateTimeFormatter.ofPattern("dd/MM/yyyy"),
        DateTimeFormatter.ofPattern("dd/MM/yy"),
        DateTimeFormatter.ofPattern("dd-MM-yyyy"),
        DateTimeFormatter.ofPattern("dd-MM-yy"),
        DateTimeFormatter.ISO_LOCAL_DATE,
        DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH),
        DateTimeFormatter.ofPattern("dd MMM, yyyy", Locale.ENGLISH));

    /** Rows/lines that are statement furniture, not transactions. */
    private static final Pattern SUMMARY_ROW = Pattern.compile(
        "(?i)opening balance|closing balance|balance b/f|balance c/f|\\bb/f\\b|\\bc/f\\b"
            + "|total\\b|grand total|statement summary");

    /** Continuation-line furniture (page headers/footers) to drop, not fold. */
    private static final Pattern FURNITURE = Pattern.compile(
        "(?i)page \\d|statement of account|account (number|no)|ifsc|micr|branch\\b"
            + "|registered office|customer id|period\\b|generated on");

    /**
     * Unlock (if needed) and parse. Mirrors {@link StatementParser}'s row
     * contract: good rows AND per-row errors, by source line number.
     *
     * @param pdfBytes the uploaded document
     * @param password nullable — required only when the PDF is encrypted
     * @throws StatementParseException whole-file failures: wrong password,
     *         password required, scanned/no text, no recognisable rows
     */
    public List<StatementParser.ParsedRow> parse(byte[] pdfBytes, String password)
        throws IOException, StatementParseException {

        final String text;
        try (PDDocument doc = Loader.loadPDF(pdfBytes, password == null ? "" : password)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            text = stripper.getText(doc);
        } catch (InvalidPasswordException wrongPassword) {
            throw new StatementParseException(
                (password == null || password.isBlank())
                    ? "this PDF is password-protected — please supply the statement password"
                    : "incorrect PDF password");
        }

        // A scanned/image-only PDF extracts NO text at all (vs a short but
        // legitimate statement) — so the guard is blankness, not length.
        if (text == null || text.isBlank()) {
            throw new StatementParseException(
                "no extractable text — this statement appears to be scanned/image-only, which is not supported yet");
        }

        // ---- fold wrapped descriptions into their date-led rows ----
        List<String> rawLines = text.lines().map(String::strip).toList();
        List<int[]> rowSpans = new ArrayList<>();   // [startLineIdx]
        List<String> rows = new ArrayList<>();
        BigDecimal seedBalance = null;              // from a pre-table "Opening Balance" line
        StringBuilder current = null;
        int currentStart = -1;
        for (int i = 0; i < rawLines.size(); i++) {
            String line = rawLines.get(i);
            if (line.isEmpty()) {
                continue;
            }
            if (LEADING_DATE.matcher(line).find()) {
                if (current != null) {
                    rows.add(current.toString());
                    rowSpans.add(new int[]{currentStart});
                }
                current = new StringBuilder(line);
                currentStart = i + 1; // 1-based for error reporting
            } else if (SUMMARY_ROW.matcher(line).find()) {
                // NEVER fold summary lines into a transaction row (a folded
                // "Closing Balance 1,10,051.00" would hijack the row's
                // trailing-amount heuristic). A summary BEFORE the first row
                // seeds the running balance for delta-direction inference.
                if (rows.isEmpty() && current == null) {
                    BigDecimal opening = lastAmount(line);
                    if (opening != null) {
                        seedBalance = opening;
                    }
                }
            } else if (current != null && !FURNITURE.matcher(line).find()) {
                current.append(' ').append(line);
            }
        }
        if (current != null) {
            rows.add(current.toString());
            rowSpans.add(new int[]{currentStart});
        }

        if (rows.isEmpty()) {
            throw new StatementParseException(
                "no transaction rows recognised — expected lines starting with a date "
                    + "(dd/MM/yyyy, dd-MM-yyyy, dd MMM yyyy or yyyy-MM-dd)");
        }

        // ---- parse each folded row ----
        List<StatementParser.ParsedRow> out = new ArrayList<>(rows.size());
        BigDecimal previousBalance = seedBalance;
        for (int r = 0; r < rows.size(); r++) {
            String row = rows.get(r);
            int lineNumber = rowSpans.get(r)[0];

            if (SUMMARY_ROW.matcher(row).find()) {
                // Statement furniture — but harvest the balance so the FIRST real
                // row after an "Opening Balance" line gets a delta direction.
                BigDecimal bal = lastAmount(row);
                if (bal != null) {
                    previousBalance = bal;
                }
                continue;
            }

            Matcher dateMatcher = LEADING_DATE.matcher(row);
            dateMatcher.find();
            LocalDate postedAt = parseDate(dateMatcher.group(1));
            if (postedAt == null) {
                out.add(StatementParser.ParsedRow.error(lineNumber,
                    "unparseable date '" + dateMatcher.group(1) + "'"));
                continue;
            }

            // All amounts in the row tail; last = running balance, the one
            // before it = the transaction amount (the common Indian layout).
            List<BigDecimal> amounts = new ArrayList<>();
            List<String> markers = new ArrayList<>();
            int firstAmountAt = -1;
            Matcher am = AMOUNT.matcher(row);
            while (am.find()) {
                amounts.add(new BigDecimal(am.group(1).replace(",", "")));
                markers.add(am.group(2) == null ? "" : am.group(2).toLowerCase(Locale.ROOT));
                if (firstAmountAt < 0) {
                    firstAmountAt = am.start();
                }
            }
            if (amounts.isEmpty()) {
                out.add(StatementParser.ParsedRow.error(lineNumber, "no amount found in row"));
                continue;
            }

            final BigDecimal amount;
            final BigDecimal balance;
            final String marker;
            if (amounts.size() >= 2) {
                balance = amounts.get(amounts.size() - 1);
                amount = amounts.get(amounts.size() - 2);
                marker = markers.get(amounts.size() - 2);
            } else {
                balance = null;
                amount = amounts.get(0);
                marker = markers.get(0);
            }

            // Direction: explicit Dr/Cr beats everything; else balance delta.
            TransactionDirection direction;
            if (marker.equals("dr")) {
                direction = TransactionDirection.debit;
            } else if (marker.equals("cr")) {
                direction = TransactionDirection.credit;
            } else if (balance != null && previousBalance != null
                       && balance.compareTo(previousBalance) != 0) {
                direction = balance.compareTo(previousBalance) < 0
                    ? TransactionDirection.debit
                    : TransactionDirection.credit;
            } else {
                out.add(StatementParser.ParsedRow.error(lineNumber,
                    "cannot determine debit/credit (no Dr/Cr marker and no usable running balance)"));
                if (balance != null) {
                    previousBalance = balance;
                }
                continue;
            }
            if (balance != null) {
                previousBalance = balance;
            }

            String description = row
                .substring(dateMatcher.end(), firstAmountAt)
                .strip()
                .replaceAll("\\s{2,}", " ");
            if (description.isEmpty()) {
                out.add(StatementParser.ParsedRow.error(lineNumber, "empty description"));
                continue;
            }

            long amountMinor = amount.movePointRight(2)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
            out.add(StatementParser.ParsedRow.ok(lineNumber,
                new RawStatementRow(postedAt, amountMinor, direction, description)));
        }

        return out;
    }

    private static LocalDate parseDate(String token) {
        for (DateTimeFormatter f : DATE_FORMATS) {
            try {
                return LocalDate.parse(token, f);
            } catch (DateTimeParseException ignored) {
                // try the next format
            }
        }
        return null;
    }

    private static BigDecimal lastAmount(String row) {
        Matcher am = AMOUNT.matcher(row);
        BigDecimal last = null;
        while (am.find()) {
            last = new BigDecimal(am.group(1).replace(",", ""));
        }
        return last;
    }
}
