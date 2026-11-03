import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { LocalPostsResolverByPage } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { localPostsTable, postsTable } from '../schema.ts';
import { resolvePostsWithAuthorByIds } from './postWithAuthorBatch.ts';

const cursorPost = alias(postsTable, 'cursor_post');

const cursorOf = (id: string) =>
  sql`select ${cursorPost.createdAt}, ${cursorPost.postId} from ${postsTable} ${cursorPost} where ${cursorPost.postId} = ${id}`;

export const createD1LocalPostsResolverByPage = (db: IoriD1Db): LocalPostsResolverByPage => ({
  resolve: async ({ currentActorId, page }) => {
    const columns = { createdAt: postsTable.createdAt, id: postsTable.postId };
    const rows = await db.select({ postId: postsTable.postId })
      .from(postsTable)
      .innerJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .where(and(isNull(postsTable.deletedAt), ...pageConditions(page, columns, cursorOf)))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    const posts = await resolvePostsWithAuthorByIds(db, rows.map((row) => PostId.orThrow(row.postId)), currentActorId);
    return RA.ok(rows.flatMap((row) => {
      const post = posts.get(PostId.orThrow(row.postId));
      return post === undefined ? [] : [post];
    }));
  },
});
