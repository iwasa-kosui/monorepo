import { RA } from '@iwasa-kosui/result';

import type { BlockCreatedStore } from '../../../domain/block/block.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { blocksTable, domainEventsTable } from '../schema.ts';

export const createD1BlockCreatedStore = (db: IoriD1Db): BlockCreatedStore => ({
  store: async (event) => {
    await db.batch([
      db.insert(blocksTable).values({ ...event.aggregateState, createdAt: new Date(event.occurredAt) }),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
