import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestExpiredStore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestItemsTable, digestsTable, digestTrendsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestExpiredStore = (db: IoriD1Db): DigestExpiredStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.delete(digestTrendsTable).where(eq(digestTrendsTable.digestId, event.eventPayload.digestId)),
        db.delete(digestItemsTable).where(eq(digestItemsTable.digestId, event.eventPayload.digestId)),
        db.delete(digestsTable).where(eq(digestsTable.digestId, event.eventPayload.digestId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
