import { RA } from '@iwasa-kosui/result';

import type { FollowRequestedStore } from '../../../domain/follow/follow.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, followsTable } from '../schema.ts';

export const createD1FollowRequestedStore = (db: IoriD1Db): FollowRequestedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.insert(followsTable).values(event.aggregateState),
          db.insert(domainEventsTable).values({
            eventId: event.eventId,
            aggregateId: JSON.stringify(event.aggregateId),
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
