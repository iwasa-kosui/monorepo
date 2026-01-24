import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RemoteLikeDeleted, RemoteLikeDeletedStore } from '../../../domain/like/like.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesTable, remoteLikesTable } from '../schema.ts';

const store = async (event: RemoteLikeDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(remoteLikesTable)
      .where(eq(remoteLikesTable.likeId, event.aggregateId.likeId));
    await tx.delete(likesTable)
      .where(eq(likesTable.likeId, event.aggregateId.likeId));
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
  (): RemoteLikeDeletedStore => ({
    store,
  }),
);

export const PgRemoteLikeDeletedStore = {
  getInstance,
} as const;
