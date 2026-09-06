import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { UndoFollowingProcessedStore } from '../../../domain/follow/follow.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, followsTable } from '../schema.ts';

export const createD1UndoFollowingProcessedStore = (db: IoriD1Db): UndoFollowingProcessedStore => ({
  store: (event) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.delete(followsTable).where(
            and(
              eq(followsTable.followerId, event.eventPayload.followerId),
              eq(followsTable.followingId, event.eventPayload.followingId),
            ),
          ),
          db.insert(domainEventsTable).values({
            eventId: event.eventId,
            aggregateId: JSON.stringify(event.aggregateId),
            aggregateName: event.aggregateName,
            aggregateState: null,
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
