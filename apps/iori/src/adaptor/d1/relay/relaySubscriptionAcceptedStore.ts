import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RelaySubscriptionAcceptedStore } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { domainEventsTable, relaysTable } from '../schema.ts';

export const createD1RelaySubscriptionAcceptedStore = (db: IoriD1Db): RelaySubscriptionAcceptedStore => ({
  store: async (event) => {
    await db.batch([
      db.update(relaysTable).set({
        status: event.aggregateState.status,
        acceptedAt: event.aggregateState.acceptedAt === null ? null : new Date(event.aggregateState.acceptedAt),
      }).where(eq(relaysTable.relayId, event.aggregateState.relayId)),
      db.insert(domainEventsTable).values({
        eventId: event.eventId,
        aggregateId: JSON.stringify(event.aggregateId),
        aggregateName: event.aggregateName,
        aggregateState: JSON.stringify(event.aggregateState),
        eventName: event.eventName,
        eventPayload: JSON.stringify(event.eventPayload),
        occurredAt: new Date(event.occurredAt),
      }),
    ]);
    return RA.ok(undefined);
  },
});
