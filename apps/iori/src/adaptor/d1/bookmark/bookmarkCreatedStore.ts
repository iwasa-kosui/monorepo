import { RA } from '@iwasa-kosui/result';

import type { BookmarkCreatedStore } from '../../../domain/bookmark/bookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { bookmarksTable, domainEventsTable } from '../schema.ts';

export const createD1BookmarkCreatedStore = (db: IoriD1Db): BookmarkCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(bookmarksTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
