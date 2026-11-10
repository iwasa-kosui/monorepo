import { RA } from '@iwasa-kosui/result';
import { lt } from 'drizzle-orm';

import type { BlueskyNotificationReceiptsExpiredStore } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyNotificationReceiptsTable } from '../schema.ts';

export const createD1BlueskyNotificationReceiptsExpiredStore = (
  db: IoriD1Db,
): BlueskyNotificationReceiptsExpiredStore => ({
  expire: async (indexedBefore) => {
    await db.delete(blueskyNotificationReceiptsTable)
      .where(lt(blueskyNotificationReceiptsTable.indexedAt, new Date(indexedBefore)));
    return RA.ok(undefined);
  },
});
