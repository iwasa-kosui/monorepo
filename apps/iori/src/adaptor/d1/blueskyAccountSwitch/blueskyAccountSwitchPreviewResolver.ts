import { RA } from '@iwasa-kosui/result';
import { and, count, eq, inArray } from 'drizzle-orm';

import type { BlueskyAccountSwitchPreviewResolver } from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  blueskyBookmarksTable,
  blueskyCrosspostsTable,
  blueskyLikesTable,
  blueskyModeratedActorsTable,
  blueskyRepostsTable,
  blueskyTimelineItemsTable,
  notificationsTable,
} from '../schema.ts';
import { BLUESKY_NOTIFICATION_TYPES } from './blueskyAccountSwitchPurger.ts';

export const createD1BlueskyAccountSwitchPreviewResolver = (db: IoriD1Db, userId: UserId): BlueskyAccountSwitchPreviewResolver => ({
  resolve: async () => {
    const [timelineItems, notifications, likes, reposts, bookmarks, moderatedActors, crossposts] = await Promise.all([
      db.select({ n: count() }).from(blueskyTimelineItemsTable).where(eq(blueskyTimelineItemsTable.userId, userId)),
      db.select({ n: count() }).from(notificationsTable)
        .where(and(
          eq(notificationsTable.recipientUserId, userId),
          inArray(notificationsTable.type, [...BLUESKY_NOTIFICATION_TYPES]),
        )),
      db.select({ n: count() }).from(blueskyLikesTable).where(eq(blueskyLikesTable.userId, userId)),
      db.select({ n: count() }).from(blueskyRepostsTable).where(eq(blueskyRepostsTable.userId, userId)),
      db.select({ n: count() }).from(blueskyBookmarksTable).where(eq(blueskyBookmarksTable.userId, userId)),
      db.select({ n: count() }).from(blueskyModeratedActorsTable).where(eq(blueskyModeratedActorsTable.userId, userId)),
      db.select({ n: count() }).from(blueskyCrosspostsTable).where(eq(blueskyCrosspostsTable.userId, userId)),
    ]);
    return RA.ok({
      timelineItems: timelineItems[0]?.n ?? 0,
      notifications: notifications[0]?.n ?? 0,
      likes: likes[0]?.n ?? 0,
      reposts: reposts[0]?.n ?? 0,
      bookmarks: bookmarks[0]?.n ?? 0,
      moderatedActors: moderatedActors[0]?.n ?? 0,
      crossposts: crossposts[0]?.n ?? 0,
    });
  },
});
