import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { TimelineItemDeleted, TimelineItemDeletedStore } from '../../../domain/timeline/timelineItem.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, timelineItemsTable } from '../schema.ts';

const store = async (...events: readonly TimelineItemDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx
        .update(timelineItemsTable)
        .set({ deletedAt: new Date(event.occurredAt) })
        .where(eq(timelineItemsTable.timelineItemId, event.eventPayload.timelineItemId));
    }
    await tx.insert(domainEventsTable).values(
      events.map((event) => ({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      })),
    );
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): TimelineItemDeletedStore => ({
    store,
  }),
);

export const PgTimelineItemDeletedStore = {
  getInstance,
} as const;
