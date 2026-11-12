import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import { Bookmark, type BookmarksResolverByPostId } from '../../../domain/bookmark/bookmark.ts';
import { BookmarkId } from '../../../domain/bookmark/bookmarkId.ts';
import type { IoriD1Db } from '../client.ts';
import { bookmarksTable } from '../schema.ts';

export const createD1BookmarksResolverByPostId = (db: IoriD1Db): BookmarksResolverByPostId => ({
  resolve: async ({ postId }) => {
    const rows = await db.select().from(bookmarksTable).where(eq(bookmarksTable.postId, postId));
    return RA.ok(rows.map((row) =>
      Bookmark.orThrow({
        bookmarkId: BookmarkId.orThrow(row.bookmarkId),
        actorId: row.actorId,
        postId: row.postId,
      })
    ));
  },
});
