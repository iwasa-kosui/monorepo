import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import { Bookmark, type BookmarkResolver } from '../../../domain/bookmark/bookmark.ts';
import { BookmarkId } from '../../../domain/bookmark/bookmarkId.ts';
import type { IoriD1Db } from '../client.ts';
import { bookmarksTable } from '../schema.ts';

const reconstructBookmark = (row: typeof bookmarksTable.$inferSelect) =>
  Bookmark.orThrow({
    bookmarkId: BookmarkId.orThrow(row.bookmarkId),
    actorId: row.actorId,
    postId: row.postId,
  });

export const createD1BookmarkResolver = (db: IoriD1Db): BookmarkResolver => ({
  resolve: async ({ actorId, postId }) => {
    const [row, ...rest] = await db.select().from(bookmarksTable)
      .where(and(eq(bookmarksTable.actorId, actorId), eq(bookmarksTable.postId, postId)));
    if (row === undefined) return RA.ok(undefined);
    if (rest.length > 0) throw new Error('Inconsistent state: multiple bookmark records found');
    return RA.ok(reconstructBookmark(row));
  },
});
