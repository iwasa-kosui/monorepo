import { RA } from '@iwasa-kosui/result';
import { sql } from 'drizzle-orm';

import type { DigestSubscriptionSavedStore } from '../../../domain/digestSubscription/digestSubscription.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestSubscriptionsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestSubscriptionSavedStore = (db: IoriD1Db): DigestSubscriptionSavedStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.insert(digestSubscriptionsTable)
          .values({
            ...event.aggregateState,
            createdAt: new Date(event.aggregateState.createdAt),
            updatedAt: new Date(event.aggregateState.updatedAt),
          })
          .onConflictDoUpdate({
            target: digestSubscriptionsTable.userId,
            set: {
              enabled: sql`excluded.enabled`,
              updatedAt: sql`excluded.updatedAt`,
            },
          }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
