import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { PushSubscriptionDeletedStore } from '../../../domain/pushSubscription/pushSubscription.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, pushSubscriptionsTable } from '../schema.ts';

export const createD1PushSubscriptionDeletedStore = (db: IoriD1Db): PushSubscriptionDeletedStore => ({
  store: async (event) => {
    await db.batch([
      db.delete(pushSubscriptionsTable).where(
        eq(pushSubscriptionsTable.subscriptionId, event.eventPayload.subscriptionId),
      ),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
