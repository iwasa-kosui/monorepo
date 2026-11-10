import { RA } from '@iwasa-kosui/result';
import { inArray, sql } from 'drizzle-orm';

import type { BlueskyNotificationExistingUrisResolver } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyNotificationReceiptsTable } from '../schema.ts';

export const createD1BlueskyNotificationExistingUrisResolver = (
  db: IoriD1Db,
): BlueskyNotificationExistingUrisResolver => ({
  resolve: async (uris) => {
    if (uris.length === 0) return RA.ok([]);
    const rows = await db.select({ uri: blueskyNotificationReceiptsTable.uri }).from(blueskyNotificationReceiptsTable)
      .where(inArray(blueskyNotificationReceiptsTable.uri, sql`(select value from json_each(${idsJson(uris)}))`));
    return RA.ok(rows.map((row) => row.uri));
  },
});
