import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleUnpublishedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleUnpublishedStore = (db: IoriD1Db): ArticleUnpublishedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.update(articlesTable).set({
          status: event.aggregateState.status,
          unpublishedAt: event.aggregateState.unpublishedAt === null
            ? null
            : new Date(event.aggregateState.unpublishedAt),
        }).where(eq(articlesTable.articleId, event.aggregateState.articleId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
