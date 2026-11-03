import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { InterestSourceContentChangedStore } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, interestSourcesTable } from '../schema.ts';

export const createD1InterestSourceContentChangedStore = (db: IoriD1Db): InterestSourceContentChangedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(interestSourcesTable)
          .set({
            contentHash: event.eventPayload.contentHash,
            occurredAt: new Date(event.eventPayload.occurredAt),
            updatedAt: new Date(event.aggregateState.updatedAt),
            embedding: null,
            embeddedAt: null,
            deletedAt: null,
          })
          .where(eq(interestSourcesTable.interestSourceId, event.eventPayload.interestSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
