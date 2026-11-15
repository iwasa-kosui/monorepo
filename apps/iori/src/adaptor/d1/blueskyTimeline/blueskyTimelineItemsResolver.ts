import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, isNotNull, lt, notExists, or, type SQL, sql } from 'drizzle-orm';

import type { BlueskyTimelineItemsResolver } from '../../../domain/blueskyTimeline/blueskyTimelineItem.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import {
  blueskyBookmarksTable,
  blueskyCrosspostsTable,
  blueskyLikesTable,
  blueskyModeratedActorsTable,
  blueskyRepostsTable,
  blueskyTimelineItemsTable,
} from '../schema.ts';
import { toBlueskyTimelineItem } from './blueskyTimelineItemRow.ts';
import { withBridgedFromPostIds } from './bridgedFromPostIds.ts';

export const createD1BlueskyTimelineItemsResolver = (db: IoriD1Db, userId: UserId): BlueskyTimelineItemsResolver => ({
  resolve: async ({ limit, before, beforeId, excludeCrossposted }) => {
    const beforeAt = before === undefined ? undefined : new Date(before);
    const conditions: SQL[] = [
      eq(blueskyTimelineItemsTable.userId, userId),
      notExists(
        db.select({ one: sql`1` }).from(blueskyModeratedActorsTable)
          .where(and(
            eq(blueskyModeratedActorsTable.userId, userId),
            or(
              eq(blueskyModeratedActorsTable.did, blueskyTimelineItemsTable.authorDid),
              eq(blueskyModeratedActorsTable.did, blueskyTimelineItemsTable.repostedByDid),
            ),
            or(eq(blueskyModeratedActorsTable.muted, 1), isNotNull(blueskyModeratedActorsTable.blockUri)),
          )),
      ),
    ];
    if (beforeAt !== undefined) {
      conditions.push(
        beforeId === undefined
          ? lt(blueskyTimelineItemsTable.indexedAt, beforeAt)
          : or(
            lt(blueskyTimelineItemsTable.indexedAt, beforeAt),
            and(
              eq(blueskyTimelineItemsTable.indexedAt, beforeAt),
              lt(blueskyTimelineItemsTable.feedItemId, beforeId),
            ),
          )!,
      );
    }
    if (excludeCrossposted === true) {
      conditions.push(
        or(
          isNotNull(blueskyTimelineItemsTable.repostedByDid),
          notExists(
            db.select({ one: sql`1` }).from(blueskyCrosspostsTable)
              .where(and(
                eq(blueskyCrosspostsTable.userId, userId),
                eq(blueskyCrosspostsTable.uri, blueskyTimelineItemsTable.uri),
              )),
          ),
        )!,
      );
    }
    const rows = await db.select({
      item: blueskyTimelineItemsTable,
      likeUri: blueskyLikesTable.likeUri,
      repostUri: blueskyRepostsTable.repostUri,
      bookmarkedUri: blueskyBookmarksTable.subjectUri,
    })
      .from(blueskyTimelineItemsTable)
      .leftJoin(blueskyLikesTable, and(eq(blueskyLikesTable.userId, userId), eq(blueskyLikesTable.subjectUri, blueskyTimelineItemsTable.uri)))
      .leftJoin(blueskyRepostsTable, and(eq(blueskyRepostsTable.userId, userId), eq(blueskyRepostsTable.subjectUri, blueskyTimelineItemsTable.uri)))
      .leftJoin(blueskyBookmarksTable, and(eq(blueskyBookmarksTable.userId, userId), eq(blueskyBookmarksTable.subjectUri, blueskyTimelineItemsTable.uri)))
      .where(and(...conditions))
      .orderBy(desc(blueskyTimelineItemsTable.indexedAt), desc(blueskyTimelineItemsTable.feedItemId))
      .limit(limit);
    return RA.ok(
      await withBridgedFromPostIds(
        db,
        rows.map(({ item, likeUri, repostUri, bookmarkedUri }) =>
          toBlueskyTimelineItem(item, likeUri !== null, repostUri !== null, bookmarkedUri !== null)
        ),
      ),
    );
  },
});
