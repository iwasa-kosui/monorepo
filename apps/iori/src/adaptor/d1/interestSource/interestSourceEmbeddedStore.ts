import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { InterestSourceEmbeddedStore } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, interestSourcesTable } from '../schema.ts';

export const createD1InterestSourceEmbeddedStore = (db: IoriD1Db): InterestSourceEmbeddedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { embedding, ...payload } = event.eventPayload;
        return [
          db.update(interestSourcesTable)
            .set({ embedding, embeddedAt: new Date(payload.embeddedAt) })
            .where(and(
              eq(interestSourcesTable.interestSourceId, payload.interestSourceId),
              eq(interestSourcesTable.contentHash, event.aggregateState.contentHash),
              isNull(interestSourcesTable.deletedAt),
            )),
          db.insert(domainEventsTable).values(toD1DomainEventRow({ ...event, eventPayload: payload })),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
