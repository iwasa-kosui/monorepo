import { RA } from '@iwasa-kosui/result';

import type { FederatedTimelineItemCreatedStore } from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, federatedTimelineItemsTable } from '../schema.ts';

export const createD1FederatedTimelineItemCreatedStore = (db: IoriD1Db): FederatedTimelineItemCreatedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    const [first, ...rest] = events;
    await db.batch([
      db.insert(federatedTimelineItemsTable).values({
        ...first.aggregateState,
        receivedAt: new Date(first.aggregateState.receivedAt),
      }),
      ...rest.map((event) =>
        db.insert(federatedTimelineItemsTable).values({
          ...event.aggregateState,
          receivedAt: new Date(event.aggregateState.receivedAt),
        })
      ),
      ...events.map((event) =>
        db.insert(domainEventsTable).values({
          eventId: event.eventId,
          aggregateId: JSON.stringify(event.aggregateId),
          aggregateName: event.aggregateName,
          aggregateState: JSON.stringify(event.aggregateState),
          eventName: event.eventName,
          eventPayload: JSON.stringify(event.eventPayload),
          occurredAt: new Date(event.occurredAt),
        })
      ),
    ]);
    return RA.ok(undefined);
  },
});
