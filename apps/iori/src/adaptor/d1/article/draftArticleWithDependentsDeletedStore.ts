import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { DraftArticleWithDependentsDeletedStore } from '../../../domain/article/article.ts';
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
  digestXPostsTable,
  domainEventsTable,
} from '../schema.ts';

export const createD1DraftArticleWithDependentsDeletedStore = (
  db: IoriD1Db,
): DraftArticleWithDependentsDeletedStore => ({
  store: async (articleDeleted, bodyDeleted, digestExpired) => {
    const { articleId } = articleDeleted.eventPayload;
    const { digestId } = digestExpired.eventPayload;
    const bodyIsUnedited =
      sql`NOT EXISTS (SELECT 1 FROM article_bodies WHERE article_bodies.articleId = ${articleId} AND article_bodies.updatedAt > articles.createdAt)`;
    const articleIsDraft =
      sql`EXISTS (SELECT 1 FROM articles WHERE articles.articleId = ${articleId} AND articles.status = 'draft' AND ${bodyIsUnedited})`;
    const insertEventIfDraft = (event: Parameters<typeof toD1DomainEventRow>[0]) => {
      const row = toD1DomainEventRow(event);
      return db.insert(domainEventsTable).select(
        db.select({
          eventId: sql<string>`${row.eventId}`.as('eventId'),
          aggregateId: sql<string>`${row.aggregateId}`.as('aggregateId'),
          aggregateName: sql<string>`${row.aggregateName}`.as('aggregateName'),
          aggregateState: sql<string | null>`${row.aggregateState}`.as('aggregateState'),
          eventName: sql<string>`${row.eventName}`.as('eventName'),
          eventPayload: sql<string>`${row.eventPayload}`.as('eventPayload'),
          occurredAt: sql<Date>`${row.occurredAt.getTime()}`.as('occurredAt'),
        }).from(articlesTable).where(
          and(eq(articlesTable.articleId, articleId), eq(articlesTable.status, 'draft'), bodyIsUnedited),
        ),
      );
    };
    const deepDiveIds = db.select({ deepDiveId: digestDeepDivesTable.deepDiveId }).from(digestDeepDivesTable).where(
      eq(digestDeepDivesTable.articleId, articleId),
    );
    await runBatch(db, [
      db.delete(digestDeepDiveTurnsTable).where(
        and(inArray(digestDeepDiveTurnsTable.deepDiveId, deepDiveIds), articleIsDraft),
      ),
      db.delete(digestDeepDivesTable).where(and(eq(digestDeepDivesTable.articleId, articleId), articleIsDraft)),
      db.delete(digestTrendsTable).where(and(eq(digestTrendsTable.digestId, digestId), articleIsDraft)),
      db.delete(digestXPostsTable).where(and(eq(digestXPostsTable.digestId, digestId), articleIsDraft)),
      db.delete(digestItemsTable).where(and(eq(digestItemsTable.digestId, digestId), articleIsDraft)),
      db.delete(digestsTable).where(and(eq(digestsTable.digestId, digestId), articleIsDraft)),
      insertEventIfDraft(digestExpired),
      db.delete(articleBodiesTable).where(and(eq(articleBodiesTable.articleId, articleId), articleIsDraft)),
      ...(bodyDeleted === undefined ? [] : [insertEventIfDraft(bodyDeleted)]),
      insertEventIfDraft(articleDeleted),
      db.delete(articlesTable).where(
        and(eq(articlesTable.articleId, articleId), eq(articlesTable.status, 'draft'), bodyIsUnedited),
      ),
    ]);
    const [remaining] = await db.select({ articleId: articlesTable.articleId }).from(articlesTable).where(
      eq(articlesTable.articleId, articleId),
    ).limit(1);
    return RA.ok({ deleted: remaining === undefined });
  },
});
