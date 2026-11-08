import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray } from 'drizzle-orm';

import type { FeedEntryExpired, FeedEntryExpiredStore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedEntriesTable } from '../schema.ts';

// 本文や URL を含むイベント。feedEntry.expired は feedEntryId だけなので対象にしない
const CONTENT_EVENT_NAMES = ['feedEntry.collected', 'feedEntry.embedded', 'feedEntry.bookmarkCountUpdated'];

export const createD1FeedEntryExpiredStore = (db: IoriD1Db): FeedEntryExpiredStore => {
  const statementsOf = (event: FeedEntryExpired) =>
    [
      db.delete(feedEntriesTable).where(eq(feedEntriesTable.feedEntryId, event.eventPayload.feedEntryId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ] as const;

  return {
    store: async (...events) => {
      await runBatch(db, events.flatMap(statementsOf));
      return RA.ok(undefined);
    },
    storeWithEventPurge: async (...events) => {
      await runBatch(
        db,
        events.flatMap((event) => [
          db.delete(domainEventsTable).where(and(
            eq(domainEventsTable.aggregateName, event.aggregateName),
            eq(domainEventsTable.aggregateId, JSON.stringify(event.aggregateId)),
            inArray(domainEventsTable.eventName, CONTENT_EVENT_NAMES),
          )),
          ...statementsOf(event),
        ]),
      );
      return RA.ok(undefined);
    },
  };
};
