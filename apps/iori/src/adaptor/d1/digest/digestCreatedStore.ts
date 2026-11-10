import { RA } from '@iwasa-kosui/result';

import type { DigestCreatedStore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestItemsTable, digestsTable, digestTrendsTable, digestXPostsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestCreatedStore = (db: IoriD1Db): DigestCreatedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { items, trends, xPostFeedEntryIds, createdAt, pushSentAt, ...digest } = event.aggregateState;
        return [
          db.insert(digestsTable).values({
            ...digest,
            createdAt: new Date(createdAt),
            pushSentAt: pushSentAt === null ? null : new Date(pushSentAt),
          }),
          ...items.map(({ feedbackAt, ...item }) =>
            db.insert(digestItemsTable).values({
              ...item,
              feedbackAt: feedbackAt === null ? null : new Date(feedbackAt),
              digestId: digest.digestId,
            })
          ),
          ...trends.map((trend) => db.insert(digestTrendsTable).values({ ...trend, digestId: digest.digestId })),
          ...xPostFeedEntryIds.map((feedEntryId, index) =>
            db.insert(digestXPostsTable).values({ digestId: digest.digestId, rank: index + 1, feedEntryId })
          ),
          db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
