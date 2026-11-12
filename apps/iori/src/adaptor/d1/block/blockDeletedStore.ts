import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlockDeletedStore } from '../../../domain/block/block.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { blocksTable, domainEventsTable } from '../schema.ts';

export const createD1BlockDeletedStore = (db: IoriD1Db): BlockDeletedStore => ({
  store: async (event) => {
    await db.batch([
      db.delete(blocksTable).where(eq(blocksTable.blockId, event.eventPayload.blockId)),
      db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
    ]);
    return RA.ok(undefined);
  },
});
