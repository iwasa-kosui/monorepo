import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import type { BlueskyViewerBookmarksSyncedStore } from '../../../domain/blueskyTimeline/blueskyBookmark.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { blueskyBookmarksTable } from '../schema.ts';

const INSERT_CHUNK_SIZE = 30;

export const createD1BlueskyViewerBookmarksSyncedStore = (
  db: IoriD1Db,
  userId: UserId,
): BlueskyViewerBookmarksSyncedStore => ({
  sync: async (bookmarks) => {
    if (bookmarks.length === 0) return RA.ok(undefined);
    const stored = await db.select({ subjectUri: blueskyBookmarksTable.subjectUri })
      .from(blueskyBookmarksTable)
      .where(and(
        eq(blueskyBookmarksTable.userId, userId),
        inArray(
          blueskyBookmarksTable.subjectUri,
          sql`(select value from json_each(${idsJson(bookmarks.map((bookmark) => bookmark.subjectUri))}))`,
        ),
      ));
    const storedUris = new Set(stored.map((row) => row.subjectUri));
    const added = bookmarks.filter((bookmark) => !storedUris.has(bookmark.subjectUri));
    for (let start = 0; start < added.length; start += INSERT_CHUNK_SIZE) {
      await db.insert(blueskyBookmarksTable)
        .values(
          added.slice(start, start + INSERT_CHUNK_SIZE).map((bookmark) => ({
            userId,
            subjectUri: bookmark.subjectUri,
            createdAt: new Date(bookmark.createdAt),
          })),
        )
        .onConflictDoNothing();
    }
    return RA.ok(undefined);
  },
  deleteStale: async (subjectUris, createdBefore) => {
    if (subjectUris.length === 0) return RA.ok(undefined);
    const condition = and(
      eq(blueskyBookmarksTable.userId, userId),
      inArray(blueskyBookmarksTable.subjectUri, sql`(select value from json_each(${idsJson(subjectUris)}))`),
      lt(blueskyBookmarksTable.createdAt, new Date(createdBefore)),
    );
    const stale = await db.select({ subjectUri: blueskyBookmarksTable.subjectUri }).from(blueskyBookmarksTable).where(
      condition,
    );
    if (stale.length === 0) return RA.ok(undefined);
    await db.delete(blueskyBookmarksTable).where(condition);
    return RA.ok(undefined);
  },
});
