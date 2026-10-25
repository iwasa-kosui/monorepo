import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { RelayUnsubscribedStore } from '../../../domain/relay/relay.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, relaysTable } from '../schema.ts';

export const createD1RelayUnsubscribedStore = (db: IoriD1Db): RelayUnsubscribedStore => ({
  store: async (...events) => {
    for (const event of events) {
      await db.batch([
        db.delete(relaysTable).where(eq(relaysTable.relayId, event.eventPayload.relayId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    }
    return RA.ok(undefined);
  },
});
