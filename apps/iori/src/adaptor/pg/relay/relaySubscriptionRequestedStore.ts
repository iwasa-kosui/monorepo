import { RA } from '@iwasa-kosui/result';

import type { RelaySubscriptionRequested, RelaySubscriptionRequestedStore } from '../../../domain/relay/relay.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, relaysTable } from '../schema.ts';

const store = async (...events: readonly RelaySubscriptionRequested[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.insert(relaysTable).values({
        relayId: event.aggregateState.relayId,
        inboxUrl: event.aggregateState.inboxUrl,
        actorUri: event.aggregateState.actorUri,
        status: event.aggregateState.status,
        createdAt: new Date(event.aggregateState.createdAt),
        acceptedAt: event.aggregateState.acceptedAt ? new Date(event.aggregateState.acceptedAt) : null,
      });
    }
    await tx.insert(domainEventsTable).values(
      events.map((event) => ({
        eventId: event.eventId,
        aggregateId: event.aggregateId,
        aggregateName: event.aggregateName,
        aggregateState: event.aggregateState,
        eventName: event.eventName,
        eventPayload: event.eventPayload,
        occurredAt: new Date(event.occurredAt),
      })),
    );
  });
  return RA.ok(undefined);
};

const getInstance = singleton(
  (): RelaySubscriptionRequestedStore => ({
    store,
  }),
);

export const PgRelaySubscriptionRequestedStore = {
  getInstance,
} as const;
