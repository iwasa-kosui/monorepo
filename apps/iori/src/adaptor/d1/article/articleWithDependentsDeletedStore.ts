import { RA } from '@iwasa-kosui/result';
import { eq, sql } from 'drizzle-orm';

import type { ArticleWithDependentsDeletedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import {
  articleBodiesTable,
  articlesTable,
  digestDeepDivesTable,
  digestDeepDiveTurnsTable,
  digestItemsTable,
  digestsTable,
  digestTrendsTable,
  domainEventsTable,
} from '../schema.ts';

export const createD1ArticleWithDependentsDeletedStore = (db: IoriD1Db): ArticleWithDependentsDeletedStore => ({
  store: async (articleDeleted, bodyDeleted, digestExpired) => {
    const { articleId } = articleDeleted.eventPayload;
    await runBatch(db, [
      db.delete(digestDeepDiveTurnsTable).where(
        sql`deepDiveId IN (SELECT deepDiveId FROM digest_deep_dives WHERE articleId = ${articleId})`,
      ),
      db.delete(digestDeepDivesTable).where(eq(digestDeepDivesTable.articleId, articleId)),
      ...(digestExpired === undefined ? [] : [
        db.delete(digestTrendsTable).where(eq(digestTrendsTable.digestId, digestExpired.eventPayload.digestId)),
        db.delete(digestItemsTable).where(eq(digestItemsTable.digestId, digestExpired.eventPayload.digestId)),
        db.delete(digestsTable).where(eq(digestsTable.digestId, digestExpired.eventPayload.digestId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(digestExpired)),
      ]),
      db.delete(articleBodiesTable).where(eq(articleBodiesTable.articleId, articleId)),
      ...(bodyDeleted === undefined ? [] : [db.insert(domainEventsTable).values(toD1DomainEventRow(bodyDeleted))]),
      db.delete(articlesTable).where(eq(articlesTable.articleId, articleId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(articleDeleted)),
    ]);
    return RA.ok(undefined);
  },
});
