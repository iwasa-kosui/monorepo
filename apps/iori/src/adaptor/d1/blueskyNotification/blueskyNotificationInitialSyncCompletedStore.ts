import { RA } from '@iwasa-kosui/result';

import type { BlueskyNotificationInitialSyncCompletedStore } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyNotificationSyncStateTable } from '../schema.ts';

export const BLUESKY_NOTIFICATION_SYNC_STATE_ID = 'default';

export const createD1BlueskyNotificationInitialSyncCompletedStore = (
  db: IoriD1Db,
): BlueskyNotificationInitialSyncCompletedStore => ({
  store: async (completedAt) => {
    await db.insert(blueskyNotificationSyncStateTable)
      .values({ id: BLUESKY_NOTIFICATION_SYNC_STATE_ID, initialSyncCompletedAt: new Date(completedAt) })
      .onConflictDoNothing();
    return RA.ok(undefined);
  },
});
