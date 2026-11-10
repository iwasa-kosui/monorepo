import { RA } from '@iwasa-kosui/result';

import type { TimelineItemCreated, TimelineItemCreatedStore } from '../../../domain/timeline/timelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { domainEventsTable, timelineItemsTable } from '../schema.ts';

export const createD1TimelineItemCreatedStore = (db: IoriD1Db): TimelineItemCreatedStore => ({
  store: (event: TimelineItemCreated) =>
    RA.flow(
      fromD1(async () => {
        await db.batch([
          db.insert(timelineItemsTable).values({
            timelineItemId: event.aggregateState.timelineItemId,
            type: event.aggregateState.type,
            actorId: event.aggregateState.actorId,
            postId: event.aggregateState.postId,
            repostId: event.aggregateState.repostId,
            createdAt: new Date(event.aggregateState.createdAt),
          }),
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
