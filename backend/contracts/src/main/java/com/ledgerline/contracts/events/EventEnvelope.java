package com.ledgerline.contracts.events;

import java.time.Instant;
import java.util.UUID;

/**
 * Every event published to Redpanda (via the M4 transactional outbox) is wrapped
 * in this envelope. Java mirror of the TS {@code EventEnvelope<TType, TPayload>}
 * (packages/types/src/events.ts).
 *
 * <ul>
 *   <li>{@code eventId} — idempotency key consumers dedupe on (exactly-once effect).</li>
 *   <li>{@code eventType} — discriminator, e.g. "transaction.ingested".</li>
 *   <li>{@code version} — lets payloads evolve without breaking consumers.</li>
 *   <li>{@code tenantId} — promoted to the envelope so a consumer can set its RLS
 *       context BEFORE touching the payload.</li>
 *   <li>{@code occurredAt} — when the event happened (TIMESTAMPTZ).</li>
 *   <li>{@code payload} — the event-specific body (a {@link DomainEventPayload}).</li>
 * </ul>
 *
 * @param <P> the payload type for this event
 */
public record EventEnvelope<P extends DomainEventPayload>(
    UUID eventId,
    String eventType,
    int version,
    UUID tenantId,
    Instant occurredAt,
    P payload
) {}
