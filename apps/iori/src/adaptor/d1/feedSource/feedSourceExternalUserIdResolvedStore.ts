import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedSourceExternalUserIdResolvedStore } from '../../../domain/feedSource/feedSource.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedSourcesTable } from '../schema.ts';

export const createD1FeedSourceExternalUserIdResolvedStore = (db: IoriD1Db): FeedSourceExternalUserIdResolvedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(feedSourcesTable).set({
          externalUserId: event.eventPayload.externalUserId,
        }).where(eq(feedSourcesTable.feedSourceId, event.eventPayload.feedSourceId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
