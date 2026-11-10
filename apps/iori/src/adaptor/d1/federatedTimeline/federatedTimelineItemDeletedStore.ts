import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { FederatedTimelineItemDeletedStore } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemDeletedStore = (
  db: IoriD1Db,
): FederatedTimelineItemDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    await db.batch([
      db.delete(federatedTimelineItemsTable).where(inArray(
        federatedTimelineItemsTable.federatedTimelineItemId,
        events.map((event) => event.eventPayload.federatedTimelineItemId),
      )),
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
