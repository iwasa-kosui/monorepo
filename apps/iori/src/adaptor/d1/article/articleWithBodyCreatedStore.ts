import { RA } from '@iwasa-kosui/result';

import type { ArticleWithBodyCreatedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articleBodiesTable, articlesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleWithBodyCreatedStore = (db: IoriD1Db): ArticleWithBodyCreatedStore => ({
  store: async (articleCreated, bodyWritten) => {
    const article = articleCreated.aggregateState;
    const body = bodyWritten.aggregateState;
    await db.batch([
      db.insert(articlesTable).values({
        ...article,
        createdAt: new Date(article.createdAt),
        publishedAt: article.publishedAt === null ? null : new Date(article.publishedAt),
        unpublishedAt: article.unpublishedAt === null ? null : new Date(article.unpublishedAt),
      }),
      db.insert(articleBodiesTable).values({
        articleId: body.articleId,
        privateHtml: body.privateHtml,
        publicHtml: body.publicHtml,
        markdown: body.markdown,
        updatedAt: new Date(body.updatedAt),
      }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(articleCreated)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(bodyWritten)),
    ]);
    return RA.ok(undefined);
  },
});
