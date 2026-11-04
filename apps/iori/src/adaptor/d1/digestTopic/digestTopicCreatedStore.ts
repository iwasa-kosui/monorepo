import { RA } from '@iwasa-kosui/result';

import type { DigestTopicCreatedStore } from '../../../domain/digestTopic/digestTopic.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestTopicsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestTopicCreatedStore = (db: IoriD1Db): DigestTopicCreatedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.insert(digestTopicsTable).values({
          ...event.aggregateState,
          embedding: null,
          embeddedAt: null,
          createdAt: new Date(event.aggregateState.createdAt),
          updatedAt: new Date(event.aggregateState.updatedAt),
        }).onConflictDoNothing(),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)).onConflictDoNothing(),
      ]),
    );
    return RA.ok(undefined);
  },
});
