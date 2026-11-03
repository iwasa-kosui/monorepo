import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { MarkerSavedStore } from '../../../domain/marker/marker.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, mastodonMarkersTable } from '../schema.ts';

export const createD1MarkerSavedStore = (db: IoriD1Db): MarkerSavedStore => ({
  store: async (...events) => {
    const [first, ...rest] = events.flatMap((event) => [
      db.insert(mastodonMarkersTable)
        .values({ ...event.aggregateState, updatedAt: new Date(event.aggregateState.updatedAt) })
        .onConflictDoUpdate({
          target: [mastodonMarkersTable.userId, mastodonMarkersTable.timeline],
          set: {
            lastReadId: sql`excluded.lastReadId`,
            version: sql`excluded.version`,
            updatedAt: sql`excluded.updatedAt`,
          },
        }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    if (first !== undefined) await db.batch([first, ...rest]);
    return RA.ok(undefined);
  },
});
