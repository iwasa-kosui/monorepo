import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { LikeDeleted, LikeDeletedStore } from '../../../domain/like/like.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesTable } from '../schema.ts';

const store = async (event: LikeDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
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
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): LikeDeletedStore => ({
    store,
  }),
);

export const PgLikeDeletedStore = {
  getInstance,
} as const;
