import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { FeedEntryEmbeddedStore } from '../../../domain/feedEntry/feedEntry.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, feedEntriesTable } from '../schema.ts';

export const createD1FeedEntryEmbeddedStore = (db: IoriD1Db): FeedEntryEmbeddedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { embedding, ...payload } = event.eventPayload;
        return [
          db.update(feedEntriesTable)
            .set({ embedding, embeddedAt: new Date(payload.embeddedAt) })
            .where(eq(feedEntriesTable.feedEntryId, payload.feedEntryId)),
          db.insert(domainEventsTable).values(toD1DomainEventRow({ ...event, eventPayload: payload })),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
