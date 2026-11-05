import { RA } from '@iwasa-kosui/result';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';

import type { ArticleWithBodyEditedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articleBodiesTable, articlesTable, domainEventsTable } from '../schema.ts';

const editableStatuses = ['draft', 'unpublished'];

export const createD1ArticleWithBodyEditedStore = (db: IoriD1Db): ArticleWithBodyEditedStore => ({
  store: async (titleChanged, bodyWritten, baseUpdatedAt) => {
    const { articleId, privateHtml, publicHtml, markdown, updatedAt } = bodyWritten.aggregateState;
    const articleIsEditable = and(
      eq(articlesTable.articleId, articleId),
      inArray(articlesTable.status, editableStatuses),
    );
    const bodyIsWritten = and(
      eq(articleBodiesTable.articleId, articleId),
      eq(articleBodiesTable.updatedAt, new Date(updatedAt)),
      markdown === null ? isNull(articleBodiesTable.markdown) : eq(articleBodiesTable.markdown, markdown),
    );
    const insertEventIfWritten = (event: Parameters<typeof toD1DomainEventRow>[0]) => {
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
        }).from(articleBodiesTable).where(bodyIsWritten),
      );
    };
    await db.batch([
      db.update(articleBodiesTable)
        .set({ privateHtml, publicHtml, markdown, updatedAt: new Date(updatedAt) })
        .where(and(
          eq(articleBodiesTable.articleId, articleId),
          eq(articleBodiesTable.updatedAt, new Date(baseUpdatedAt)),
          exists(db.select({ one: sql`1` }).from(articlesTable).where(articleIsEditable)),
        )),
      insertEventIfWritten(bodyWritten),
      ...(titleChanged === undefined
        ? []
        : [
          db.update(articlesTable).set({ title: titleChanged.aggregateState.title }).where(
            and(articleIsEditable, exists(db.select({ one: sql`1` }).from(articleBodiesTable).where(bodyIsWritten))),
          ),
          insertEventIfWritten(titleChanged),
        ]),
    ]);
    const [written] = await db.select({ eventId: domainEventsTable.eventId }).from(domainEventsTable).where(
      eq(domainEventsTable.eventId, bodyWritten.eventId),
    ).limit(1);
    return RA.ok({ edited: written !== undefined });
  },
});
