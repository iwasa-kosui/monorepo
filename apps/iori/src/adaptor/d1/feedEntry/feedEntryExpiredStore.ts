import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedEntryExpiredStore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryExpiredStore = (db: IoriD1Db): FeedEntryExpiredStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.delete(feedEntriesTable).where(eq(feedEntriesTable.feedEntryId, event.eventPayload.feedEntryId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
