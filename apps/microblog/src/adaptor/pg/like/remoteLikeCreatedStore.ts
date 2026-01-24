import { RA } from '@iwasa-kosui/result';

import type { RemoteLikeCreated, RemoteLikeCreatedStore } from '../../../domain/like/like.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesTable, remoteLikesTable } from '../schema.ts';

const store = async (event: RemoteLikeCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(likesTable).values({
      likeId: event.aggregateState.likeId,
      actorId: event.aggregateState.actorId,
      postId: event.aggregateState.postId,
      type: 'remote',
      createdAt: new Date(event.occurredAt),
    });
    await tx.insert(remoteLikesTable).values({
      likeId: event.aggregateState.likeId,
      likeActivityUri: event.aggregateState.likeActivityUri,
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
  (): RemoteLikeCreatedStore => ({
    store,
  }),
);

export const PgRemoteLikeCreatedStore = {
  getInstance,
} as const;
