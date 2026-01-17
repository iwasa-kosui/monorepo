import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type {
  PushSubscriptionDeleted,
  PushSubscriptionDeletedStore,
} from '../../../domain/pushSubscription/pushSubscription.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, pushSubscriptionsTable } from '../schema.ts';

const store = async (event: PushSubscriptionDeleted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx
      .delete(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.subscriptionId, event.eventPayload.subscriptionId));
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): PushSubscriptionDeletedStore => ({
    store,
  }),
);

export const PgPushSubscriptionDeletedStore = {
  getInstance,
} as const;
