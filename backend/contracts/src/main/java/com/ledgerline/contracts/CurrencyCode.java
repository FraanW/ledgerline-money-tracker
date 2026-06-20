package com.ledgerline.contracts;

/**
 * Supported currencies. Mirror of the TS {@code CurrencyCode} union in
 * packages/types/src/money.ts. Single member today (INR); the enum exists so a
 * new currency is an added constant, not a type-shape change — exactly as the
 * Postgres {@code currency_code} ENUM and the TS union are shaped.
 */
public enum CurrencyCode {
    INR
}
