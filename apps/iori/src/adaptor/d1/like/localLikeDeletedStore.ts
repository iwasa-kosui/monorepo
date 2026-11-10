import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { LocalLikeDeletedStore } from '../../../domain/like/like.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, likesTable, localLikesTable } from '../schema.ts';

export const createD1LocalLikeDeletedStore = (db: IoriD1Db): LocalLikeDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    const ids = events.map((event) => event.eventPayload.likeId);
    await db.batch([
      db.delete(localLikesTable).where(inArray(localLikesTable.likeId, ids)),
      db.delete(likesTable).where(inArray(likesTable.likeId, ids)),
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
