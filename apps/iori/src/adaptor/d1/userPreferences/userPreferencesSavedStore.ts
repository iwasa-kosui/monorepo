import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { UserPreferencesSavedStore } from '../../../domain/userPreferences/userPreferences.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { domainEventsTable, userPreferencesTable } from '../schema.ts';

export const createD1UserPreferencesSavedStore = (db: IoriD1Db): UserPreferencesSavedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.insert(userPreferencesTable)
          .values({
            ...event.aggregateState,
            createdAt: new Date(event.aggregateState.createdAt),
            updatedAt: new Date(event.aggregateState.updatedAt),
          })
          .onConflictDoUpdate({
            target: userPreferencesTable.userId,
            set: {
              defaultPostVisibility: sql`excluded.defaultPostVisibility`,
              updatedAt: sql`excluded.updatedAt`,
            },
          }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
