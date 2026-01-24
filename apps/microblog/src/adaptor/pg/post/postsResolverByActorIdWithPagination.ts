import { RA } from '@iwasa-kosui/result';
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LocalPost, type PostsResolverByActorIdWithPagination, RemotePost } from '../../../domain/post/post.ts';
import { Post } from '../../../domain/post/post.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import {
  actorsTable,
  emojiReactsTable,
  likesTable,
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  repostsTable,
  usersTable,
} from '../schema.ts';

const getInstance = singleton((): PostsResolverByActorIdWithPagination => {
  const resolve = async (
    { actorId, currentActorId, createdAt }: {
      actorId: ActorId;
      currentActorId: ActorId | undefined;
      createdAt: Instant | undefined;
    },
  ) => {
    const rows = await DB.getInstance().select()
      .from(postsTable)
      .leftJoin(
        localPostsTable,
        eq(postsTable.postId, localPostsTable.postId),
      )
      .leftJoin(
        remotePostsTable,
        eq(postsTable.postId, remotePostsTable.postId),
      )
      .leftJoin(
        actorsTable,
        eq(postsTable.actorId, actorsTable.actorId),
      )
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId),
      )
      .leftJoin(
        remoteActorsTable,
        eq(actorsTable.actorId, remoteActorsTable.actorId),
      )
      .leftJoin(
        usersTable,
        eq(localActorsTable.userId, usersTable.userId),
      )
      .leftJoin(
        likesTable,
        and(
          eq(likesTable.postId, postsTable.postId),
          eq(likesTable.actorId, currentActorId ?? randomUUID()),
        ),
      )
      .where(and(
        eq(postsTable.actorId, actorId),
        isNull(postsTable.deletedAt),
        createdAt ? lt(postsTable.createdAt, Instant.toDate(createdAt)) : undefined,
      ))
      .limit(10)
      .orderBy(desc(postsTable.createdAt))
      .execute();

    // Fetch images for all posts
    const postIds = rows.map(row => row.posts.postId);
    const imageRows = postIds.length > 0
      ? await DB.getInstance().select()
        .from(postImagesTable)
        .where(inArray(postImagesTable.postId, postIds))
        .execute()
      : [];

    // Group images by postId
    const imagesByPostId = new Map<string, { url: string; altText: string | null }[]>();
    for (const imageRow of imageRows) {
      const existing = imagesByPostId.get(imageRow.postId) ?? [];
      existing.push({ url: imageRow.url, altText: imageRow.altText });
      imagesByPostId.set(imageRow.postId, existing);
    }

    // Fetch current user's reposts to determine reposted state
    const repostedPostIds = new Set<string>();
    if (currentActorId && postIds.length > 0) {
      const repostRows = await DB.getInstance()
        .select({ postId: repostsTable.postId })
        .from(repostsTable)
        .where(
          and(
            eq(repostsTable.actorId, currentActorId),
            inArray(repostsTable.postId, postIds),
          ),
        )
        .execute();
      for (const row of repostRows) {
        repostedPostIds.add(row.postId);
      }
    }

    // Fetch like counts for all posts
    const likeCountsByPostId = new Map<string, number>();
    if (postIds.length > 0) {
      const likeCountRows = await DB.getInstance()
        .select({
          postId: likesTable.postId,
          count: sql<number>`count(*)::int`,
        })
        .from(likesTable)
        .where(inArray(likesTable.postId, postIds))
        .groupBy(likesTable.postId)
        .execute();
      for (const row of likeCountRows) {
        likeCountsByPostId.set(row.postId, row.count);
      }
    }

    // Fetch repost counts for all posts
    const repostCountsByPostId = new Map<string, number>();
    if (postIds.length > 0) {
      const repostCountRows = await DB.getInstance()
        .select({
          postId: repostsTable.postId,
          count: sql<number>`count(*)::int`,
        })
        .from(repostsTable)
        .where(inArray(repostsTable.postId, postIds))
        .groupBy(repostsTable.postId)
        .execute();
      for (const row of repostCountRows) {
        repostCountsByPostId.set(row.postId, row.count);
      }
    }

    // Fetch emoji reactions for all posts
    const reactionsByPostId = new Map<string, { emoji: string; count: number; emojiImageUrl: string | null }[]>();
    if (postIds.length > 0) {
      const reactionRows = await DB.getInstance()
        .select({
          postId: emojiReactsTable.postId,
          emoji: emojiReactsTable.emoji,
          emojiImageUrl: emojiReactsTable.emojiImageUrl,
          count: sql<number>`count(*)::int`,
        })
        .from(emojiReactsTable)
        .where(inArray(emojiReactsTable.postId, postIds))
        .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl)
        .execute();
      for (const row of reactionRows) {
        const existing = reactionsByPostId.get(row.postId) ?? [];
        existing.push({ emoji: row.emoji, count: row.count, emojiImageUrl: row.emojiImageUrl });
        reactionsByPostId.set(row.postId, existing);
      }
    }

    return RA.ok(rows.map(row => {
      const images = imagesByPostId.get(row.posts.postId) ?? [];
      const reposted = repostedPostIds.has(row.posts.postId);
      const likeCount = likeCountsByPostId.get(row.posts.postId) ?? 0;
      const repostCount = repostCountsByPostId.get(row.posts.postId) ?? 0;
      const reactions = reactionsByPostId.get(row.posts.postId) ?? [];
      if (row.local_posts) {
        const post: LocalPost = LocalPost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          userId: row.local_posts.userId,
          inReplyToUri: row.local_posts.inReplyToUri,
          type: 'local',
        });
        return {
          ...post,
          username: Username.orThrow(row.users!.username),
          logoUri: row.actors!.logoUri ?? undefined,
          liked: row.likes !== null,
          reposted,
          images,
          likeCount,
          repostCount,
          reactions,
        };
      }
      if (row.remote_posts) {
        const post: Post = RemotePost.orThrow({
          postId: row.posts.postId,
          uri: row.remote_posts.uri,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          inReplyToUri: row.remote_posts.inReplyToUri,
          type: 'remote',
        });
        return {
          ...post,
          username: Username.orThrow(row.remote_actors!.username!),
          logoUri: row.actors!.logoUri ?? undefined,
          liked: row.likes !== null,
          reposted,
          images,
          likeCount,
          repostCount,
          reactions,
        };
      }
      throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
    }));
  };
  return { resolve };
});

export const PgPostsResolverByActorIdWithPagination = {
  getInstance,
} as const;
