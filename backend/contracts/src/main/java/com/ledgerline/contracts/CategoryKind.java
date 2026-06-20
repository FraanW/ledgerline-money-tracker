package com.ledgerline.contracts;

/**
 * Mirror of the TS {@code CategoryKind} union and the Postgres
 * {@code category_kind} ENUM.
 */
public enum CategoryKind {
    income,
    expense,
    transfer
}
