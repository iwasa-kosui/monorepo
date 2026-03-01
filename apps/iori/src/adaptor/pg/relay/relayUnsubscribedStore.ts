import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RelayUnsubscribed, RelayUnsubscribedStore } from '../../../domain/relay/relay.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { domainEventsTable, relaysTable } from '../schema.ts';

const store = async (...events: readonly RelayUnsubscribed[]): RA<void, never> => {
  if (events.length === 0) {
    return RA.ok(undefined);
  }
  await DB.getInstance().transaction(async (tx) => {
    for (const event of events) {
      await tx.delete(relaysTable).where(eq(relaysTable.relayId, event.eventPayload.relayId));
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
  (): RelayUnsubscribedStore => ({
    store,
  }),
);

export const PgRelayUnsubscribedStore = {
  getInstance,
} as const;
