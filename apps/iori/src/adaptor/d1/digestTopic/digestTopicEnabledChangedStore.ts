import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { DigestTopicEnabledChangedStore } from '../../../domain/digestTopic/digestTopic.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestTopicsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestTopicEnabledChangedStore = (db: IoriD1Db): DigestTopicEnabledChangedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(digestTopicsTable)
          .set({
            enabled: event.eventPayload.enabled,
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
