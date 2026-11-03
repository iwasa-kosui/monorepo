import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourceFetchFailedStore } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceFetchFailedStore = (db: IoriD1Db): FeedSourceFetchFailedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(feedSourcesTable).set({
          lastError: event.eventPayload.lastError,
          lastFetchedAt: new Date(event.eventPayload.lastFetchedAt),
        }).where(eq(feedSourcesTable.feedSourceId, event.eventPayload.feedSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
