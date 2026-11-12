import { RA } from '@iwasa-kosui/result';
import { inArray } from 'drizzle-orm';

import type { BookmarkDeletedStore } from '../../../domain/bookmark/bookmark.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { bookmarksTable, domainEventsTable } from '../schema.ts';

export const createD1BookmarkDeletedStore = (db: IoriD1Db): BookmarkDeletedStore => ({
  store: async (...events) => {
    if (events.length === 0) return RA.ok(undefined);
    await db.batch([
      db.delete(bookmarksTable).where(
        inArray(bookmarksTable.bookmarkId, events.map((event) => event.eventPayload.bookmarkId)),
      ),
      ...events.map((event) => db.insert(domainEventsTable).values(toD1DomainEventRow(event))),
    ]);
    return RA.ok(undefined);
  },
});
