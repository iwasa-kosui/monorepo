import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { DigestPushSentStore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { digestsTable, domainEventsTable } from '../schema.ts';

export const createD1DigestPushSentStore = (db: IoriD1Db): DigestPushSentStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => [
        db.update(digestsTable)
          .set({ pushSentAt: new Date(event.eventPayload.pushSentAt) })
          .where(eq(digestsTable.digestId, event.eventPayload.digestId)),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]),
    );
    return RA.ok(undefined);
  },
});
