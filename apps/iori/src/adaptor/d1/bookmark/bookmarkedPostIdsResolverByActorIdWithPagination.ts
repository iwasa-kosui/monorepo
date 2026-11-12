import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { BookmarkedPostIdsResolverByActorIdWithPagination } from '../../../domain/bookmark/bookmark.ts';
import { BookmarkId } from '../../../domain/bookmark/bookmarkId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { visibleToViewer } from '../post/visibleToViewer.ts';
import { bookmarksTable, postsTable } from '../schema.ts';

const cursorBookmark = alias(bookmarksTable, 'cursor_bookmark');

export const createD1BookmarkedPostIdsResolverByActorIdWithPagination = (
  db: IoriD1Db,
): BookmarkedPostIdsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, page }) => {
    const columns = { createdAt: bookmarksTable.createdAt, id: bookmarksTable.bookmarkId };
    const cursorOf = (id: string) =>
      sql`select ${cursorBookmark.createdAt}, ${cursorBookmark.bookmarkId} from ${bookmarksTable} ${cursorBookmark}
        where ${cursorBookmark.bookmarkId} = ${id} and ${cursorBookmark.actorId} = ${actorId}`;
    const rows = await db.select({ bookmarkId: bookmarksTable.bookmarkId, postId: bookmarksTable.postId })
      .from(bookmarksTable)
      .innerJoin(postsTable, eq(bookmarksTable.postId, postsTable.postId))
      .where(and(
        eq(bookmarksTable.actorId, actorId),
        isNull(postsTable.deletedAt),
        visibleToViewer({ currentActorId: actorId, onlyVisibleToViewer: true }),
        ...pageConditions(page, columns, cursorOf),
      ))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    return RA.ok(
      rows.map((row) => ({ bookmarkId: BookmarkId.orThrow(row.bookmarkId), postId: PostId.orThrow(row.postId) })),
    );
  },
});
