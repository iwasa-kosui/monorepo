import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourceEnabledChangedStore } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceEnabledChangedStore = (db: IoriD1Db): FeedSourceEnabledChangedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(feedSourcesTable)
          .set({ enabled: event.eventPayload.enabled })
          .where(eq(feedSourcesTable.feedSourceId, event.eventPayload.feedSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)).onConflictDoNothing(),
      ]),
    );
    return RA.ok(undefined);
  },
});
