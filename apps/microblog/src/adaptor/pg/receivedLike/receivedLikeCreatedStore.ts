import { RA } from '@iwasa-kosui/result';

import type { ReceivedLikeCreated, ReceivedLikeCreatedStore } from '../../../domain/receivedLike/receivedLike.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, receivedLikesTable } from '../schema.ts';

const store = async (event: ReceivedLikeCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(receivedLikesTable).values({
      receivedLikeId: event.aggregateState.receivedLikeId,
      likerActorId: event.aggregateState.likerActorId,
      likedPostId: event.aggregateState.likedPostId,
      likeActivityUri: event.aggregateState.likeActivityUri,
      createdAt: new Date(event.occurredAt),
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
  (): ReceivedLikeCreatedStore => ({
    store,
  }),
);

export const PgReceivedLikeCreatedStore = {
  getInstance,
} as const;
