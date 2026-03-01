import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RepostDeleted, RepostDeletedStore } from '../../../domain/repost/repost.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, repostsTable } from '../schema.ts';

const store = async (...events: readonly RepostDeleted[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.delete(repostsTable).where(eq(repostsTable.repostId, event.eventPayload.repostId));
    }
    await tx.insert(domainEventsTable).values(
      events.map((event) => ({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      })),
    );
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
