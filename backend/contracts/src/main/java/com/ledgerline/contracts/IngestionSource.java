package com.ledgerline.contracts;

/**
 * How a transaction entered the system — the v0 -> v1 swap point.
 * v0 only ever writes {@code statement_upload}; v1 adds {@code account_aggregator}.
 * Mirror of the TS {@code IngestionSource} union and the Postgres
 * {@code ingestion_source} ENUM.
 */
public enum IngestionSource {
    statement_upload,
    account_aggregator
}
