import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleDeleted, ArticleDeletedStore } from '../../../domain/article/article.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

const store = async (...events: readonly ArticleDeleted[]): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      const { articleId } = event.eventPayload;
      await tx.delete(articlesTable).where(eq(articlesTable.articleId, articleId));
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

const getInstance = singleton((): ArticleDeletedStore => ({
  store,
}));

export const PgArticleDeletedStore = {
  getInstance,
} as const;
