import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { LikeV2Deleted, LikeV2DeletedStore } from '../../../domain/like/likeV2.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, likesV2Table } from '../schema.ts';

const store = async (event: LikeV2Deleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(likesV2Table)
      .where(eq(likesV2Table.likeId, event.aggregateId.likeId));
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
  (): LikeV2DeletedStore => ({
    store,
  }),
);

export const PgLikeV2DeletedStore = {
  getInstance,
} as const;
