import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleDeletedStore } from '../../../domain/article/article.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articlesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleDeletedStore = (db: IoriD1Db): ArticleDeletedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.delete(articlesTable).where(eq(articlesTable.articleId, event.eventPayload.articleId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
