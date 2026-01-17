import { RA } from '@iwasa-kosui/result';

import type { TimelineItemCreated, TimelineItemCreatedStore } from '../../../domain/timeline/timelineItem.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, timelineItemsTable } from '../schema.ts';

const store = async (event: TimelineItemCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(timelineItemsTable).values({
      timelineItemId: event.aggregateState.timelineItemId,
      type: event.aggregateState.type,
      actorId: event.aggregateState.actorId,
      postId: event.aggregateState.postId,
      repostId: event.aggregateState.repostId,
      createdAt: new Date(event.aggregateState.createdAt),
    });
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): TimelineItemCreatedStore => ({
    store,
  }),
);

export const PgTimelineItemCreatedStore = {
  getInstance,
} as const;
