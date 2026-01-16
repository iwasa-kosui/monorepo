import { RA } from '@iwasa-kosui/result';

import type { FollowRequested, FollowRequestedStore } from '../../../domain/follow/follow.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, followsTable } from '../schema.ts';

const store = async (event: FollowRequested): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(followsTable).values({
      followerId: event.aggregateState.followerId,
      followingId: event.aggregateState.followingId,
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

const getInstance = singleton((): FollowRequestedStore => ({
  store,
}));

export const PgFollowRequestedStore = {
  getInstance,
} as const;
