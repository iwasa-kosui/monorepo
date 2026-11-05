import { RA } from '@iwasa-kosui/result';
import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';

import type { DigestDeepDiveBodyWrittenStore } from '../../../domain/digestDeepDive/digestDeepDive.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import {
  articleBodiesTable,
  articlesTable,
  digestDeepDivesTable,
  digestDeepDiveTurnsTable,
  domainEventsTable,
} from '../schema.ts';

const editableStatuses = ['draft', 'unpublished'];

export const createD1DigestDeepDiveBodyWrittenStore = (db: IoriD1Db): DigestDeepDiveBodyWrittenStore => ({
  store: async (deepDiveEvent, bodyWritten, baseUpdatedAt) => {
    const { articleId, privateHtml, publicHtml, markdown, updatedAt } = bodyWritten.aggregateState;
    const deepDive = deepDiveEvent.aggregateState;
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
    const turn = deepDiveEvent.eventName === 'digestDeepDive.started'
      ? deepDiveEvent.aggregateState.turns[0]!
      : deepDiveEvent.eventPayload.turn;
    const deepDiveStatements = deepDiveEvent.eventName === 'digestDeepDive.started'
      ? [
        db.insert(digestDeepDivesTable).select(
          db.select({
            deepDiveId: sql<string>`${deepDive.deepDiveId}`.as('deepDiveId'),
            userId: sql<string>`${deepDive.userId}`.as('userId'),
            digestItemId: sql<string>`${deepDive.digestItemId}`.as('digestItemId'),
            articleId: sql<string>`${deepDive.articleId}`.as('articleId'),
            createdAt: sql<Date>`${deepDive.createdAt}`.as('createdAt'),
            updatedAt: sql<Date>`${deepDive.updatedAt}`.as('updatedAt'),
          }).from(articleBodiesTable).where(bodyIsWritten),
        ),
      ]
      : [
        db.update(digestDeepDivesTable).set({ updatedAt: new Date(deepDive.updatedAt) }).where(and(
          eq(digestDeepDivesTable.deepDiveId, deepDive.deepDiveId),
          exists(db.select({ one: sql`1` }).from(articleBodiesTable).where(bodyIsWritten)),
        )),
      ];
    await db.batch([
      db.update(articleBodiesTable)
        .set({ privateHtml, publicHtml, markdown, updatedAt: new Date(updatedAt) })
        .where(and(
          eq(articleBodiesTable.articleId, articleId),
          eq(articleBodiesTable.updatedAt, new Date(baseUpdatedAt)),
          exists(db.select({ one: sql`1` }).from(articlesTable).where(articleIsEditable)),
        )),
      insertEventIfWritten(bodyWritten),
      ...deepDiveStatements,
      db.insert(digestDeepDiveTurnsTable).select(
        db.select({
          turnId: sql<string>`${turn.turnId}`.as('turnId'),
          deepDiveId: sql<string>`${deepDive.deepDiveId}`.as('deepDiveId'),
          turnNumber: sql<number>`${turn.turnNumber}`.as('turnNumber'),
          instruction: sql<string>`${turn.instruction}`.as('instruction'),
          resultMarkdown: sql<string>`${turn.resultMarkdown}`.as('resultMarkdown'),
          createdAt: sql<Date>`${turn.createdAt}`.as('createdAt'),
        }).from(articleBodiesTable).where(bodyIsWritten),
      ),
      insertEventIfWritten(deepDiveEvent),
    ]);
    const [written] = await db.select({ eventId: domainEventsTable.eventId }).from(domainEventsTable).where(
      eq(domainEventsTable.eventId, bodyWritten.eventId),
    ).limit(1);
    return RA.ok({ written: written !== undefined });
  },
});
