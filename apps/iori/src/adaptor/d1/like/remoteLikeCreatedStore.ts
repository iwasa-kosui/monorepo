import { RA } from '@iwasa-kosui/result';

import type { RemoteLikeCreatedStore } from '../../../domain/like/like.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, likesTable, remoteLikesTable } from '../schema.ts';

export const createD1RemoteLikeCreatedStore = (db: IoriD1Db): RemoteLikeCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(likesTable).values({
        likeId: event.aggregateState.likeId,
        actorId: event.aggregateState.actorId,
        postId: event.aggregateState.postId,
        type: 'remote',
        createdAt: new Date(event.occurredAt),
      }),
      db.insert(remoteLikesTable).values({
        likeId: event.aggregateState.likeId,
        likeActivityUri: event.aggregateState.likeActivityUri,
      }),
      db.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: JSON.stringify(event.aggregateId),
        aggregateName: event.aggregateName,
        aggregateState: JSON.stringify(event.aggregateState),
        eventName: event.eventName,
        eventPayload: JSON.stringify(event.eventPayload),
        occurredAt: new Date(event.occurredAt),
      }),
    ]);
    return RA.ok(undefined);
  },
});
