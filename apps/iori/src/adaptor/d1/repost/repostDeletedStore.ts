import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { RepostDeletedStore } from '../../../domain/repost/repost.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, repostsTable } from '../schema.ts';

export const createD1RepostDeletedStore = (db: IoriD1Db): RepostDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    await db.batch([
      db.delete(repostsTable).where(inArray(repostsTable.repostId, events.map((event) => event.eventPayload.repostId))),
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
