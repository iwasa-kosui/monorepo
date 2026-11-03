import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourceFetchedStore } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceFetchedStore = (db: IoriD1Db): FeedSourceFetchedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(feedSourcesTable).set({
          etag: event.eventPayload.etag,
          lastModified: event.eventPayload.lastModified,
          lastFetchedAt: new Date(event.eventPayload.lastFetchedAt),
          lastError: null,
        }).where(eq(feedSourcesTable.feedSourceId, event.eventPayload.feedSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
