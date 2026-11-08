import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { DigestTopicMaterialWindowChangedStore } from '../../../domain/digestTopic/digestTopic.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestTopicsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestTopicMaterialWindowChangedStore = (db: IoriD1Db): DigestTopicMaterialWindowChangedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(digestTopicsTable)
          .set({
            materialWindowHours: event.eventPayload.materialWindowHours,
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
