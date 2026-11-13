import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { LocalPostsResolverByPage } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { localPostsTable, postsTable } from '../schema.ts';
import { resolvePostsWithAuthorByIds } from './postWithAuthorBatch.ts';

const cursorPost = alias(postsTable, 'cursor_post');

const cursorOf = (id: string) =>
  sql`select ${cursorPost.createdAt}, ${cursorPost.postId} from ${postsTable} ${cursorPost} where ${cursorPost.postId} = ${id}`;

export const localPostIdsPageQuery = (
  db: IoriD1Db,
  { mutedActorIds, page }: Pick<Parameters<LocalPostsResolverByPage['resolve']>[0], 'mutedActorIds' | 'page'>,
) => {
  const columns = { createdAt: localPostsTable.createdAt, id: localPostsTable.postId };
  return db.select({ postId: postsTable.postId })
    .from(localPostsTable)
    .crossJoin(postsTable)
    .where(and(
      eq(postsTable.postId, localPostsTable.postId),
      isNull(postsTable.deletedAt),
      eq(localPostsTable.visibility, 'public'),
      mutedActorIds.length === 0
        ? undefined
        : notInArray(postsTable.actorId, sql`(select value from json_each(${idsJson(mutedActorIds)}))`),
      ...pageConditions(page, columns, cursorOf),
    ))
    .orderBy(...pageOrderBy(page, columns))
    .limit(page.limit);
};

export const createD1LocalPostsResolverByPage = (db: IoriD1Db): LocalPostsResolverByPage => ({
  resolve: async ({ currentActorId, mutedActorIds, page }) => {
    const rows = await localPostIdsPageQuery(db, { mutedActorIds, page });
    const posts = await resolvePostsWithAuthorByIds(db, rows.map((row) => PostId.orThrow(row.postId)), currentActorId);
    return RA.ok(rows.flatMap((row) => {
      const post = posts.get(PostId.orThrow(row.postId));
      return post === undefined ? [] : [post];
    }));
  },
});
