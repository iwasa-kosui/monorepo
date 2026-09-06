import { RA } from '@iwasa-kosui/result';

import type { LocalLikeCreatedStore } from '../../../domain/like/like.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, likesTable, localLikesTable } from '../schema.ts';

export const createD1LocalLikeCreatedStore = (db: IoriD1Db): LocalLikeCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(likesTable).values({
        likeId: event.aggregateState.likeId,
        actorId: event.aggregateState.actorId,
        postId: event.aggregateState.postId,
        type: 'local',
        createdAt: new Date(event.occurredAt),
      }),
      db.insert(localLikesTable).values({ likeId: event.aggregateState.likeId }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
