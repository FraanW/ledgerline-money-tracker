package com.ledgerline.contracts;

/**
 * Mirror of the TS {@code AccountType} union and the Postgres
 * {@code account_type} ENUM.
 */
public enum AccountType {
    savings,
    current,
    credit_card,
    other
}
