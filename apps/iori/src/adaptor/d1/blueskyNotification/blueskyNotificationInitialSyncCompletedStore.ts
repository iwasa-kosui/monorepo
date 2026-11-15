import { RA } from '@iwasa-kosui/result';

import type { BlueskyNotificationInitialSyncCompletedStore } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyNotificationSyncStateTable } from '../schema.ts';

export const createD1BlueskyNotificationInitialSyncCompletedStore = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyNotificationInitialSyncCompletedStore => ({
  store: async (completedAt) => {
    await db.insert(blueskyNotificationSyncStateTable)
      .values({ userId, initialSyncCompletedAt: new Date(completedAt) })
      .onConflictDoNothing();
    return RA.ok(undefined);
  },
});
