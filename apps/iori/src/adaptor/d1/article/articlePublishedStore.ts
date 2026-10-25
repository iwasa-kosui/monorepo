import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticlePublishedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticlePublishedStore = (db: IoriD1Db): ArticlePublishedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.update(articlesTable).set({
          status: event.aggregateState.status,
          publishedAt: event.aggregateState.publishedAt === null ? null : new Date(event.aggregateState.publishedAt),
        }).where(eq(articlesTable.articleId, event.aggregateState.articleId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
