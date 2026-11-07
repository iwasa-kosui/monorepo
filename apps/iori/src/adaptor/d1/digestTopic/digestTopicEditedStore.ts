import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { DigestTopicEditedStore } from '../../../domain/digestTopic/digestTopic.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestTopicsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestTopicEditedStore = (db: IoriD1Db): DigestTopicEditedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(digestTopicsTable)
          .set({
            name: event.eventPayload.name,
            description: event.eventPayload.description,
            embedding: null,
            embeddedAt: null,
            updatedAt: new Date(event.eventPayload.updatedAt),
          })
          .where(and(
            eq(digestTopicsTable.userId, event.eventPayload.userId),
            eq(digestTopicsTable.topicKey, event.eventPayload.topicKey),
          )),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)).onConflictDoNothing(),
      ]),
    );
    return RA.ok(undefined);
  },
});
