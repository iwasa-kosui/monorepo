import { RA } from '@iwasa-kosui/result';

import type { RepostCreatedStore } from '../../../domain/repost/repost.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, repostsTable } from '../schema.ts';

export const createD1RepostCreatedStore = (db: IoriD1Db): RepostCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(repostsTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
      db.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: JSON.stringify(event.aggregateId),
        aggregateName: event.aggregateName,
        aggregateState: JSON.stringify(event.aggregateState),
        eventName: event.eventName,
        eventPayload: JSON.stringify(event.eventPayload),
        occurredAt: new Date(event.occurredAt),
      }),
    ]);
    return RA.ok(undefined);
  },
});
