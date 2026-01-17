import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ReceivedLikeDeleted, ReceivedLikeDeletedStore } from '../../../domain/receivedLike/receivedLike.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, receivedLikesTable } from '../schema.ts';

const store = async (event: ReceivedLikeDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(receivedLikesTable)
      .where(eq(receivedLikesTable.receivedLikeId, event.aggregateId.receivedLikeId));
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
  (): ReceivedLikeDeletedStore => ({
    store,
  }),
);

export const PgReceivedLikeDeletedStore = {
  getInstance,
} as const;
