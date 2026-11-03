import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedEntryBookmarkCountUpdatedStore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryBookmarkCountUpdatedStore = (db: IoriD1Db): FeedEntryBookmarkCountUpdatedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(feedEntriesTable)
          .set({ hatenaBookmarkCount: event.eventPayload.hatenaBookmarkCount })
          .where(eq(feedEntriesTable.feedEntryId, event.eventPayload.feedEntryId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
