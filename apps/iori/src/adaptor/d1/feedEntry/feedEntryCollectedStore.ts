import { RA } from '@iwasa-kosui/result';

import type { FeedEntryCollectedStore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryCollectedStore = (db: IoriD1Db): FeedEntryCollectedStore => ({
  store: async (...events) => {
    await runBatch(db, [
      ...events.map((event) =>
        db.insert(feedEntriesTable).values({
          ...event.aggregateState,
          publishedAt: event.aggregateState.publishedAt === null ? null : new Date(event.aggregateState.publishedAt),
          fetchedAt: new Date(event.aggregateState.fetchedAt),
        })
      ),
      ...events.map((event) => db.insert(domainEventsTable).values(toD1DomainEventRow(event))),
    ]);
    return RA.ok(undefined);
  },
});
