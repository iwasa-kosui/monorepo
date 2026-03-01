import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  FederatedTimelineItemDeleted,
  FederatedTimelineItemDeletedStore,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, federatedTimelineItemsTable } from '../schema.ts';

const store = async (...events: readonly FederatedTimelineItemDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.delete(federatedTimelineItemsTable).where(
        eq(federatedTimelineItemsTable.federatedTimelineItemId, event.eventPayload.federatedTimelineItemId),
      );
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
  (): FederatedTimelineItemDeletedStore => ({
    store,
  }),
);

export const PgFederatedTimelineItemDeletedStore = {
  getInstance,
} as const;
