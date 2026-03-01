import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { LocalLikeDeleted, LocalLikeDeletedStore } from '../../../domain/like/like.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesTable, localLikesTable } from '../schema.ts';

const store = async (...events: readonly LocalLikeDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.delete(localLikesTable)
        .where(eq(localLikesTable.likeId, event.eventPayload.likeId));
      await tx.delete(likesTable)
        .where(eq(likesTable.likeId, event.eventPayload.likeId));
      await tx.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      });
    }
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): LocalLikeDeletedStore => ({
    store,
  }),
);

export const PgLocalLikeDeletedStore = {
  getInstance,
} as const;
