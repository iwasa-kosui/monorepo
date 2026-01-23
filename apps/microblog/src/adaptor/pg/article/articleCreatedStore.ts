import { RA } from '@iwasa-kosui/result';

import type { ArticleCreated, ArticleCreatedStore } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

const store = async (...events: readonly ArticleCreated[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const article = event.aggregateState;
      await tx.insert(articlesTable).values({
        articleId: article.articleId,
        authorActorId: article.authorActorId,
        authorUserId: article.authorUserId,
        rootPostId: article.rootPostId,
        title: article.title,
        status: article.status,
        createdAt: new Date(article.createdAt),
        publishedAt: article.publishedAt ? new Date(article.publishedAt) : null,
        unpublishedAt: article.unpublishedAt ? new Date(article.unpublishedAt) : null,
      });
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

const getInstance = singleton((): ArticleCreatedStore => ({
  store,
}));

export const PgArticleCreatedStore = {
  getInstance,
} as const;
