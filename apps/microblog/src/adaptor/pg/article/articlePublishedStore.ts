import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticlePublished, ArticlePublishedStore } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

const store = async (...events: readonly ArticlePublished[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const article = event.aggregateState;
      await tx.update(articlesTable)
        .set({
          status: article.status,
          publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
        })
        .where(eq(articlesTable.articleId, article.articleId));
      await tx.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      });
    }
  });
  return RA.ok(undefined);
};

const getInstance = singleton((): ArticlePublishedStore => ({
  store,
}));

export const PgArticlePublishedStore = {
  getInstance,
} as const;
