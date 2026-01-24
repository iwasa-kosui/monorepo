import { RA } from '@iwasa-kosui/result';

import type { LocalLikeCreated, LocalLikeCreatedStore } from '../../../domain/like/like.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesTable, localLikesTable } from '../schema.ts';

const store = async (event: LocalLikeCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(likesTable).values({
      likeId: event.aggregateState.likeId,
      actorId: event.aggregateState.actorId,
      postId: event.aggregateState.postId,
      type: 'local',
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(localLikesTable).values({
      likeId: event.aggregateState.likeId,
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
  (): LocalLikeCreatedStore => ({
    store,
  }),
);

export const PgLocalLikeCreatedStore = {
  getInstance,
} as const;
