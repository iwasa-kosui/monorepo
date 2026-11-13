import { RA } from '@iwasa-kosui/result';
import { count, inArray } from 'drizzle-orm';

import type { BlueskyAccountSwitchPreviewResolver } from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
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

export const createD1BlueskyAccountSwitchPreviewResolver = (db: IoriD1Db): BlueskyAccountSwitchPreviewResolver => ({
  resolve: async () => {
    const [timelineItems, notifications, likes, reposts, bookmarks, moderatedActors, crossposts] = await Promise.all([
      db.select({ n: count() }).from(blueskyTimelineItemsTable),
      db.select({ n: count() }).from(notificationsTable)
        .where(inArray(notificationsTable.type, [...BLUESKY_NOTIFICATION_TYPES])),
      db.select({ n: count() }).from(blueskyLikesTable),
      db.select({ n: count() }).from(blueskyRepostsTable),
      db.select({ n: count() }).from(blueskyBookmarksTable),
      db.select({ n: count() }).from(blueskyModeratedActorsTable),
      db.select({ n: count() }).from(blueskyCrosspostsTable),
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
