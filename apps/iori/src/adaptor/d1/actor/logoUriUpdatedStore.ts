import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { actorsTable, domainEventsTable } from '../schema.ts';

export const createD1LogoUriUpdatedStore = (db: IoriD1Db): LogoUriUpdatedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.update(actorsTable).set({ logoUri: event.aggregateState.logoUri }).where(
            eq(actorsTable.actorId, event.aggregateId),
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
