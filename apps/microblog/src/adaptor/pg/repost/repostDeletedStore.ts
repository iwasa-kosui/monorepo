import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RepostDeleted, RepostDeletedStore } from '../../../domain/repost/repost.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, repostsTable } from '../schema.ts';

const store = async (event: RepostDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.delete(repostsTable).where(eq(repostsTable.repostId, event.eventPayload.repostId));
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
  (): RepostDeletedStore => ({
    store,
  }),
);

export const PgRepostDeletedStore = {
  getInstance,
} as const;
