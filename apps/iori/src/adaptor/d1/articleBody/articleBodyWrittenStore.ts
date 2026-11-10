import { RA } from '@iwasa-kosui/result';

import type { ArticleBodyWrittenStore } from '../../../domain/articleBody/articleBody.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articleBodiesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleBodyWrittenStore = (db: IoriD1Db): ArticleBodyWrittenStore => ({
  store: async (...events) => {
    for (const event of events) {
      const { articleId, privateHtml, publicHtml, markdown, updatedAt } = event.aggregateState;
      await db.batch([
        db.insert(articleBodiesTable).values({
          articleId,
          privateHtml,
          publicHtml,
          markdown,
          updatedAt: new Date(updatedAt),
        }).onConflictDoUpdate({
          target: articleBodiesTable.articleId,
          set: { privateHtml, publicHtml, markdown, updatedAt: new Date(updatedAt) },
        }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
