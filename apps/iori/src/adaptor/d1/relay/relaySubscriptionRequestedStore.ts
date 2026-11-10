import { RA } from '@iwasa-kosui/result';

import type { RelaySubscriptionRequestedStore } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, relaysTable } from '../schema.ts';

export const createD1RelaySubscriptionRequestedStore = (
  db: IoriD1Db,
): RelaySubscriptionRequestedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.insert(relaysTable).values({
          ...event.aggregateState,
          createdAt: new Date(event.aggregateState.createdAt),
          acceptedAt: event.aggregateState.acceptedAt === null ? null : new Date(event.aggregateState.acceptedAt),
        }),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
