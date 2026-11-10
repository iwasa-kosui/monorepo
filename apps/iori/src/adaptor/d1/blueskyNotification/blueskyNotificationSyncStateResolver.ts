import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyNotificationSyncStateResolver } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyNotificationSyncStateTable } from '../schema.ts';
import { BLUESKY_NOTIFICATION_SYNC_STATE_ID } from './blueskyNotificationInitialSyncCompletedStore.ts';

export const createD1BlueskyNotificationSyncStateResolver = (
  db: IoriD1Db,
): BlueskyNotificationSyncStateResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyNotificationSyncStateTable)
      .where(eq(blueskyNotificationSyncStateTable.id, BLUESKY_NOTIFICATION_SYNC_STATE_ID)).limit(1);
    return RA.ok(
      row === undefined ? undefined : { initialSyncCompletedAt: Instant.orThrow(row.initialSyncCompletedAt.getTime()) },
    );
  },
});
