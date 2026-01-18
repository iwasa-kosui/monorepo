import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  TimelineItemsDeletedByPostId,
  TimelineItemsDeletedByPostIdStore,
} from '../../../domain/timeline/timelineItem.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, timelineItemsTable } from '../schema.ts';

const store = async (event: TimelineItemsDeletedByPostId): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(timelineItemsTable).where(eq(timelineItemsTable.postId, event.eventPayload.postId));
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
  (): TimelineItemsDeletedByPostIdStore => ({
    store,
  }),
);

export const PgTimelineItemsDeletedByPostIdStore = {
  getInstance,
} as const;
