import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import type { AccountStatusItem, AccountStatusItemsResolverByActorId } from '../../../domain/post/accountStatusItem.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { RepostId } from '../../../domain/repost/repostId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import {
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remotePostsTable,
  repostsTable,
} from '../schema.ts';
import { resolvePostsWithAuthorByIds } from './postWithAuthorBatch.ts';

const cursorPost = alias(postsTable, 'cursor_post');
const cursorRepost = alias(repostsTable, 'cursor_repost');

const cursorOf = (id: string) =>
  sql`select cursor_entry.createdAt, cursor_entry.id from (
    select ${cursorPost.createdAt} as createdAt, ${cursorPost.postId} as id from ${postsTable} ${cursorPost}
      where ${cursorPost.postId} = ${id}
    union all
    select ${cursorRepost.createdAt} as createdAt, ${cursorRepost.repostId} as id from ${repostsTable} ${cursorRepost}
      where ${cursorRepost.repostId} = ${id}
  ) cursor_entry limit 1`;

type Entry = Readonly<{
  id: string;
  createdAt: number;
  postId: PostId;
  repost: Readonly<{ repostId: RepostId; reposterActorId: ActorId }> | undefined;
}>;

const comparePosition = (page: PageRequest) => (a: Entry, b: Entry): number => {
  const order = a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return page.order === 'newestFirst' ? -order : order;
};

export const createD1AccountStatusItemsResolverByActorId = (db: IoriD1Db): AccountStatusItemsResolverByActorId => ({
  resolve: async ({ actorId, currentActorId, page, excludeReplies, excludeReblogs, onlyMedia }) => {
    const postColumns = { createdAt: postsTable.createdAt, id: postsTable.postId };
    const repostColumns = { createdAt: repostsTable.createdAt, id: repostsTable.repostId };
    const [postRows, repostRows] = await Promise.all([
      db.select({ postId: postsTable.postId, createdAt: postsTable.createdAt })
        .from(postsTable)
        .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
        .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
        .where(and(
          eq(postsTable.actorId, actorId),
          isNull(postsTable.deletedAt),
          excludeReplies ? and(isNull(localPostsTable.inReplyToUri), isNull(remotePostsTable.inReplyToUri)) : undefined,
          onlyMedia
            ? sql`exists (select 1 from ${postImagesTable} where ${postImagesTable.postId} = ${postsTable.postId})`
            : undefined,
          ...pageConditions(page, postColumns, cursorOf),
        ))
        .orderBy(...pageOrderBy(page, postColumns))
        .limit(page.limit),
      excludeReblogs || onlyMedia
        ? Promise.resolve([])
        : db.select({ repostId: repostsTable.repostId, postId: repostsTable.postId, createdAt: repostsTable.createdAt })
          .from(repostsTable)
          .innerJoin(localActorsTable, eq(repostsTable.actorId, localActorsTable.actorId))
          .innerJoin(postsTable, eq(repostsTable.postId, postsTable.postId))
          .where(and(
            eq(repostsTable.actorId, actorId),
            isNull(postsTable.deletedAt),
            ...pageConditions(page, repostColumns, cursorOf),
          ))
          .orderBy(...pageOrderBy(page, repostColumns))
          .limit(page.limit),
    ]);

    const entries: Entry[] = [
      ...postRows.map((row): Entry => ({
        id: row.postId,
        createdAt: row.createdAt.getTime(),
        postId: PostId.orThrow(row.postId),
        repost: undefined,
      })),
      ...repostRows.map((row): Entry => ({
        id: row.repostId,
        createdAt: row.createdAt.getTime(),
        postId: PostId.orThrow(row.postId),
        repost: { repostId: RepostId.orThrow(row.repostId), reposterActorId: actorId },
      })),
    ].sort(comparePosition(page)).slice(0, page.limit);

    const posts = await resolvePostsWithAuthorByIds(db, entries.map((entry) => entry.postId), currentActorId);
    return RA.ok(entries.flatMap((entry): AccountStatusItem[] => {
      const post = posts.get(entry.postId);
      if (post === undefined) return [];
      return entry.repost === undefined
        ? [{ type: 'post', post }]
        : [{
          type: 'repost',
          repostId: entry.repost.repostId,
          reposterActorId: entry.repost.reposterActorId,
          createdAt: Instant.orThrow(entry.createdAt),
          post,
        }];
    }));
  },
});
