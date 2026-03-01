import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleUnpublished, ArticleUnpublishedStore } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

const store = async (...events: readonly ArticleUnpublished[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const article = event.aggregateState;
      await tx.update(articlesTable)
        .set({
          status: article.status,
          unpublishedAt: article.unpublishedAt ? new Date(article.unpublishedAt) : null,
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

const getInstance = singleton((): ArticleUnpublishedStore => ({
  store,
}));

export const PgArticleUnpublishedStore = {
  getInstance,
} as const;
