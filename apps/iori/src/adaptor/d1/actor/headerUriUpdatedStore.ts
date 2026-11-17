import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { HeaderUriUpdatedStore } from '../../../domain/actor/updateHeaderUri.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, localActorsTable } from '../schema.ts';

export const createD1HeaderUriUpdatedStore = (db: IoriD1Db): HeaderUriUpdatedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.update(localActorsTable).set({ headerUri: event.aggregateState.headerUri ?? null }).where(
            eq(localActorsTable.actorId, event.aggregateId),
          ),
          db.insert(domainEventsTable).values({
            eventId: event.eventId,
            aggregateId: event.aggregateId,
            aggregateName: event.aggregateName,
            aggregateState: JSON.stringify(event.aggregateState),
            eventName: event.eventName,
            eventPayload: JSON.stringify(event.eventPayload),
            occurredAt: new Date(event.occurredAt),
          }),
        ]);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
