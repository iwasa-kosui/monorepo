import { RA } from '@iwasa-kosui/result';

import type { FeedSourceCreatedStore } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceCreatedStore = (db: IoriD1Db): FeedSourceCreatedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.insert(feedSourcesTable).values({
          ...event.aggregateState,
          lastFetchedAt: event.aggregateState.lastFetchedAt === null
            ? null
            : new Date(event.aggregateState.lastFetchedAt),
          createdAt: new Date(event.aggregateState.createdAt),
        }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
