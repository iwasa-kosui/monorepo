import { RA } from '@iwasa-kosui/result';

import type { MuteCreatedStore } from '../../../domain/mute/mute.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { domainEventsTable, mutesTable } from '../schema.ts';

export const createD1MuteCreatedStore = (db: IoriD1Db): MuteCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(mutesTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
