import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ArticleBodyDeletedStore } from '../../../domain/articleBody/articleBody.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { articleBodiesTable, domainEventsTable } from '../schema.ts';

export const createD1ArticleBodyDeletedStore = (db: IoriD1Db): ArticleBodyDeletedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.delete(articleBodiesTable).where(eq(articleBodiesTable.articleId, event.eventPayload.articleId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
