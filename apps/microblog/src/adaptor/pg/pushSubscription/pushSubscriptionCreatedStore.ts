import { RA } from '@iwasa-kosui/result';

import type {
  PushSubscriptionCreated,
  PushSubscriptionCreatedStore,
} from '../../../domain/pushSubscription/pushSubscription.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, pushSubscriptionsTable } from '../schema.ts';

const store = async (event: PushSubscriptionCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(pushSubscriptionsTable).values({
      subscriptionId: event.aggregateState.subscriptionId,
      userId: event.aggregateState.userId,
      endpoint: event.aggregateState.endpoint,
      p256dhKey: event.aggregateState.p256dhKey,
      authKey: event.aggregateState.authKey,
      createdAt: new Date(event.occurredAt),
    });
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
  (): PushSubscriptionCreatedStore => ({
    store,
  }),
);

export const PgPushSubscriptionCreatedStore = {
  getInstance,
} as const;
