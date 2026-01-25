import { RA } from '@iwasa-kosui/result';

import type {
  FederatedTimelineItemCreated,
  FederatedTimelineItemCreatedStore,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, federatedTimelineItemsTable } from '../schema.ts';

const store = async (...events: readonly FederatedTimelineItemCreated[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.insert(federatedTimelineItemsTable).values({
        federatedTimelineItemId: event.aggregateState.federatedTimelineItemId,
        postId: event.aggregateState.postId,
        relayId: event.aggregateState.relayId,
        receivedAt: new Date(event.aggregateState.receivedAt),
      });
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
  (): FederatedTimelineItemCreatedStore => ({
    store,
  }),
);

export const PgFederatedTimelineItemCreatedStore = {
  getInstance,
} as const;
