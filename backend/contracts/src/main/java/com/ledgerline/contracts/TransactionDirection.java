package com.ledgerline.contracts;

/**
 * debit = money leaving the account; credit = money arriving.
 * Mirror of the TS {@code TransactionDirection} union and the Postgres
 * {@code transaction_direction} ENUM. Lowercase wire names match both.
 */
public enum TransactionDirection {
    debit,
    credit
}
