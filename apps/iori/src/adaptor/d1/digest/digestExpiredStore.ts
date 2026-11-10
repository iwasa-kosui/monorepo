import { RA } from '@iwasa-kosui/result';
import { eq, sql } from 'drizzle-orm';

import type { DigestExpiredStore } from '../../../domain/digest/digest.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import {
  digestDeepDivesTable,
  digestDeepDiveTurnsTable,
  digestItemsTable,
  digestsTable,
  digestTrendsTable,
  digestXPostsTable,
  domainEventsTable,
} from '../schema.ts';

export const createD1DigestExpiredStore = (db: IoriD1Db): DigestExpiredStore => ({
  store: async (...events) => {
    await runBatch(
      db,
      events.flatMap((event) => {
        const { digestId } = event.eventPayload;
        const itemIds = sql`(SELECT digestItemId FROM digest_items WHERE digestId = ${digestId})`;
        return [
          db.delete(digestDeepDiveTurnsTable).where(
            sql`deepDiveId IN (SELECT deepDiveId FROM digest_deep_dives WHERE digestItemId IN ${itemIds})`,
          ),
          db.delete(digestDeepDivesTable).where(sql`digestItemId IN ${itemIds}`),
          db.delete(digestTrendsTable).where(eq(digestTrendsTable.digestId, digestId)),
          db.delete(digestXPostsTable).where(eq(digestXPostsTable.digestId, digestId)),
          db.delete(digestItemsTable).where(eq(digestItemsTable.digestId, digestId)),
          db.delete(digestsTable).where(eq(digestsTable.digestId, digestId)),
          db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
        ];
      }),
    );
    return RA.ok(undefined);
  },
});
