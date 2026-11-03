import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { InterestSourceDeletedStore } from '../../../domain/interestSource/interestSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, interestSourcesTable } from '../schema.ts';

export const createD1InterestSourceDeletedStore = (db: IoriD1Db): InterestSourceDeletedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(interestSourcesTable)
          .set({ deletedAt: new Date(event.eventPayload.deletedAt) })
          .where(eq(interestSourcesTable.interestSourceId, event.eventPayload.interestSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
