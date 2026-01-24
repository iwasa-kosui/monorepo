import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LocalPost, type PostImage, type PostWithAuthor } from '../../../domain/post/post.ts';
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
  repostsTable,
  usersTable,
} from '../schema.ts';

export type LocalPostsResolver = Agg.Resolver<
  { createdAt: Instant | undefined; limit?: number },
  PostWithAuthor[]
>;

const getInstance = singleton((): LocalPostsResolver => {
  const resolve = async ({ createdAt, limit = 20 }: { createdAt: Instant | undefined; limit?: number }) => {
    const rows = await DB.getInstance()
      .select()
      .from(postsTable)
      .innerJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(
        and(
          eq(postsTable.type, 'local'),
          isNull(postsTable.deletedAt),
          createdAt ? lt(postsTable.createdAt, Instant.toDate(createdAt)) : undefined,
        ),
      )
      .limit(limit)
      .orderBy(desc(postsTable.createdAt))
      .execute();

    const postIds = rows.map((row) => row.posts.postId);
    const imageRows = postIds.length > 0
      ? await DB.getInstance()
        .select()
        .from(postImagesTable)
        .where(inArray(postImagesTable.postId, postIds))
        .execute()
      : [];

    const imagesByPostId = new Map<string, PostImage[]>();
    for (const imageRow of imageRows) {
      const existing = imagesByPostId.get(imageRow.postId) ?? [];
      existing.push({ url: imageRow.url, altText: imageRow.altText });
      imagesByPostId.set(imageRow.postId, existing);
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

    return RA.ok(
      rows.map((row) => {
        const images = imagesByPostId.get(row.posts.postId) ?? [];
        const likeCount = likeCountsByPostId.get(row.posts.postId) ?? 0;
        const repostCount = repostCountsByPostId.get(row.posts.postId) ?? 0;
        const reactions = reactionsByPostId.get(row.posts.postId) ?? [];
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
          username: Username.orThrow(row.users.username),
          logoUri: row.actors.logoUri ?? undefined,
          liked: false,
          reposted: false,
          images,
          likeCount,
          repostCount,
          reactions,
        };
      }),
    );
  };
  return { resolve };
});

export const PgLocalPostsResolver = {
  getInstance,
} as const;
