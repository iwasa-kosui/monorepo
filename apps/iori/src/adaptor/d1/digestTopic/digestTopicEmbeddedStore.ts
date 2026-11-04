import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

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
        return [
          db.update(digestTopicsTable)
            .set({ embedding, embeddedAt: new Date(payload.embeddedAt), updatedAt: new Date(payload.embeddedAt) })
            .where(and(
              eq(digestTopicsTable.userId, payload.userId),
              eq(digestTopicsTable.topicKey, payload.topicKey),
              eq(digestTopicsTable.description, event.aggregateState.description),
            )),
          db.insert(domainEventsTable).values(toD1DomainEventRow({ ...event, eventPayload: payload })),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
