import { RA } from '@iwasa-kosui/result';

import type { ArticleCreatedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleCreatedStore = (db: IoriD1Db): ArticleCreatedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.insert(articlesTable).values({
          ...event.aggregateState,
          createdAt: new Date(event.aggregateState.createdAt),
          publishedAt: event.aggregateState.publishedAt === null ? null : new Date(event.aggregateState.publishedAt),
          unpublishedAt: event.aggregateState.unpublishedAt === null
            ? null
            : new Date(event.aggregateState.unpublishedAt),
        }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
