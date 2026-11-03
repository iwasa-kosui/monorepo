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
import {
  actorsTable,
  emojiReactsTable,
  likesTable,
  linkPreviewsTable,
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  repostsTable,
  usersTable,
} from '../schema.ts';
import { buildPostWithAuthor } from './threadResolver.ts';

const groupByPostId = <T extends { postId: string }>(rows: readonly T[]): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.postId) ?? [];
    group.push(row);
    grouped.set(row.postId, group);
  }
  return grouped;
};

const resolvePosts = async (
  db: IoriD1Db,
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
    posts: postsTable,
    local_posts: localPostsTable,
    remote_posts: remotePostsTable,
    actors: actorsTable,
    local_actors: localActorsTable,
    remote_actors: remoteActorsTable,
    users: usersTable,
    liked: liked.mapWith(value => value === 1),
    reposted: reposted.mapWith(value => value === 1),
  })
    .from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
    .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
    .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
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
  if (rows.length === 0) return [];
  const postIds = rows.map((row) => row.posts.postId);
  const [imageRows, likeCounts, repostCounts, reactionRows, previewRows] = await Promise.all([
    db.select().from(postImagesTable).where(inArray(postImagesTable.postId, postIds)),
    db.select({ postId: likesTable.postId, count: sql<number>`count(*)` })
      .from(likesTable).where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
    db.select({ postId: repostsTable.postId, count: sql<number>`count(*)` })
      .from(repostsTable).where(inArray(repostsTable.postId, postIds)).groupBy(repostsTable.postId),
    db.select({
      postId: emojiReactsTable.postId,
      emoji: emojiReactsTable.emoji,
      emojiImageUrl: emojiReactsTable.emojiImageUrl,
      count: sql<number>`count(*)`,
    }).from(emojiReactsTable).where(inArray(emojiReactsTable.postId, postIds))
      .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl),
    db.select().from(linkPreviewsTable).where(inArray(linkPreviewsTable.postId, postIds)),
  ]);
  const imagesByPostId = groupByPostId(imageRows);
  const reactionsByPostId = groupByPostId(reactionRows);
  const previewsByPostId = groupByPostId(previewRows);
  const likeCountByPostId = new Map(likeCounts.map(({ postId, count }) => [postId, Number(count)]));
  const repostCountByPostId = new Map(repostCounts.map(({ postId, count }) => [postId, Number(count)]));
  return rows.map((row) => ({
    ...buildPostWithAuthor(row, {
      images: imagesByPostId.get(row.posts.postId) ?? [],
      likeCount: likeCountByPostId.get(row.posts.postId) ?? 0,
      repostCount: repostCountByPostId.get(row.posts.postId) ?? 0,
      reactions: (reactionsByPostId.get(row.posts.postId) ?? []).map(({ emoji, emojiImageUrl, count }) => ({
        emoji,
        emojiImageUrl,
        count,
      })),
      previews: previewsByPostId.get(row.posts.postId) ?? [],
    }),
    liked: row.liked,
    reposted: row.reposted,
  }));
};

export const createD1PostsResolverByActorIds = (
  db: IoriD1Db,
  _origin: string,
): PostsResolverByActorIds => ({
  resolve: async ({ actorIds, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, { actorIds, currentActorId, createdAt })),
});

export const createD1PostsResolverByActorIdWithPagination = (
  db: IoriD1Db,
  _origin: string,
): PostsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, currentActorId, createdAt }) =>
    RA.ok(await resolvePosts(db, { actorIds: [actorId], currentActorId, createdAt })),
});

export const createD1LocalPostsResolver = (db: IoriD1Db, _origin: string) => ({
  resolve: async ({ createdAt, limit }: { createdAt: Instant | undefined; limit?: number }) =>
    RA.ok(await resolvePosts(db, { createdAt, localOnly: true, limit })),
});
