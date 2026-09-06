import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { TimelineItemDeletedStore } from '../../../domain/timeline/timelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, timelineItemsTable } from '../schema.ts';

export const createD1TimelineItemDeletedStore = (db: IoriD1Db): TimelineItemDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    const [first, ...rest] = events;
    await db.batch([
      db.update(timelineItemsTable)
        .set({ deletedAt: new Date(first.occurredAt) })
        .where(eq(timelineItemsTable.timelineItemId, first.eventPayload.timelineItemId)),
      ...rest.map((event) =>
        db.update(timelineItemsTable)
          .set({ deletedAt: new Date(event.occurredAt) })
          .where(eq(timelineItemsTable.timelineItemId, event.eventPayload.timelineItemId))
      ),
      ...events.map((event) =>
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: JSON.stringify(event.aggregateId),
          aggregateName: event.aggregateName,
          aggregateState: null,
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        })
      ),
    ]);
    return RA.ok(undefined);
  },
});
