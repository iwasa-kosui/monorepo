import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { BlueskyNotificationSyncStateResolver } from '../../../domain/blueskyNotification/blueskyNotification.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { blueskyNotificationSyncStateTable } from '../schema.ts';

export const createD1BlueskyNotificationSyncStateResolver = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyNotificationSyncStateResolver => ({
  resolve: async () => {
    const [row] = await db.select().from(blueskyNotificationSyncStateTable)
      .where(eq(blueskyNotificationSyncStateTable.userId, userId)).limit(1);
    return RA.ok(
      row === undefined ? undefined : { initialSyncCompletedAt: Instant.orThrow(row.initialSyncCompletedAt.getTime()) },
    );
  },
});
