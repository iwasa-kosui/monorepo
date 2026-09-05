import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type {
  PostsResolverByActorIds,
  PostsResolverByActorIdWithPagination,
  PostWithAuthor,
} from '../../../domain/post/post.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { likesTable, localPostsTable, postsTable, repostsTable } from '../schema.ts';
import { createD1ThreadResolver } from './threadResolver.ts';

const resolvePosts = async (
  db: IoriD1Db,
  origin: string,
  input: Readonly<{
    actorIds?: readonly ActorId[];
    currentActorId?: ActorId;
    localOnly?: boolean;
    createdAt: Instant | undefined;
    limit?: number;
  }>,
): Promise<PostWithAuthor[]> => {
  if (input.actorIds?.length === 0) return [];
  const liked = input.currentActorId === undefined ? sql<number>`0` : sql<number>`exists (
    select 1 from ${likesTable} where ${likesTable.postId} = ${postsTable.postId}
      and ${likesTable.actorId} = ${input.currentActorId}
  )`;
  const reposted = input.currentActorId === undefined ? sql<number>`0` : sql<number>`exists (
    select 1 from ${repostsTable} where ${repostsTable.postId} = ${postsTable.postId}
      and ${repostsTable.actorId} = ${input.currentActorId}
  )`;
  const rows = await db.select({
    postId: postsTable.postId,
    liked: liked.mapWith(value => value === 1),
    reposted: reposted.mapWith(value => value === 1),
  })
    .from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .where(and(
      isNull(postsTable.deletedAt),
      input.actorIds === undefined
        ? undefined
        : inArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson(input.actorIds)}))`),
      input.localOnly === true ? eq(localPostsTable.postId, postsTable.postId) : undefined,
      input.createdAt === undefined ? undefined : lt(postsTable.createdAt, new Date(input.createdAt)),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(input.limit ?? 20);
  const threadResolver = createD1ThreadResolver(db, origin);
  const resolved = await Promise.all(rows.map((row) => threadResolver.resolve({ postId: row.postId as never })));
  return resolved.flatMap((result, index) =>
    result.ok && result.val.currentPost !== null
      ? [{ ...result.val.currentPost, liked: rows[index].liked, reposted: rows[index].reposted }]
      : []
  );
};

export const createD1PostsResolverByActorIds = (
  db: IoriD1Db,
  origin: string,
): PostsResolverByActorIds => ({
  resolve: async ({ actorIds, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, origin, { actorIds, currentActorId, createdAt })),
});

export const createD1PostsResolverByActorIdWithPagination = (
  db: IoriD1Db,
  origin: string,
): PostsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, origin, { actorIds: [actorId], currentActorId, createdAt })),
});

export const createD1LocalPostsResolver = (db: IoriD1Db, origin: string) => ({
  resolve: async ({ createdAt, limit }: { createdAt: Instant | undefined; limit?: number }) =>
    RA.ok(await resolvePosts(db, origin, { createdAt, localOnly: true, limit })),
});
