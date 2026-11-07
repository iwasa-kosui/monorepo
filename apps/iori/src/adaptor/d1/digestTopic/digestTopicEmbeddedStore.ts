import { RA } from '@iwasa-kosui/result';
import { and, eq, sql } from 'drizzle-orm';

import type { DigestTopicEmbeddedStore } from '../../../domain/digestTopic/digestTopic.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestTopicsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestTopicEmbeddedStore = (db: IoriD1Db): DigestTopicEmbeddedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { embedding, ...payload } = event.eventPayload;
        const row = toD1DomainEventRow({ ...event, eventPayload: payload });
        const embeddedAt = new Date(payload.embeddedAt);
        const matched = and(
          eq(digestTopicsTable.userId, payload.userId),
          eq(digestTopicsTable.topicKey, payload.topicKey),
          eq(digestTopicsTable.name, event.aggregateState.name),
          eq(digestTopicsTable.description, event.aggregateState.description),
        );
        return [
          db.update(digestTopicsTable)
            .set({ embedding, embeddedAt, updatedAt: embeddedAt })
            .where(matched),
          db.insert(domainEventsTable).select(
            sql`select ${row.eventId}, ${row.aggregateId}, ${row.aggregateName}, ${row.aggregateState}, ${row.eventName}, ${row.eventPayload}, ${row.occurredAt.getTime()} where exists (select 1 from ${digestTopicsTable} where ${matched} and ${
              eq(digestTopicsTable.embeddedAt, embeddedAt)
            })`,
          ),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
