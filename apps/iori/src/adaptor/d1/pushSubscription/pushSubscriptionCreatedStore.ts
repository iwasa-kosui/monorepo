import { RA } from '@iwasa-kosui/result';

import type { PushSubscriptionCreatedStore } from '../../../domain/pushSubscription/pushSubscription.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, pushSubscriptionsTable } from '../schema.ts';

export const createD1PushSubscriptionCreatedStore = (db: IoriD1Db): PushSubscriptionCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(pushSubscriptionsTable).values({
        ...event.aggregateState,
        createdAt: new Date(event.occurredAt),
      }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
