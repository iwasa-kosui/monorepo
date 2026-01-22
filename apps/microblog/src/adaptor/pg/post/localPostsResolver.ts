import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LocalPost, type PostImage, type PostQuery } from '../../../domain/post/post.ts';
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
  PostQuery[]
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
      const likeRows = await DB.getInstance()
        .select({ postId: likesTable.postId })
        .from(likesTable)
        .where(inArray(likesTable.postId, postIds))
        .execute();
      for (const row of likeRows) {
        const count = likeCountsByPostId.get(row.postId) ?? 0;
        likeCountsByPostId.set(row.postId, count + 1);
      }
    }

    // Fetch repost counts for all posts
    const repostCountsByPostId = new Map<string, number>();
    if (postIds.length > 0) {
      const repostRows = await DB.getInstance()
        .select({ postId: repostsTable.postId })
        .from(repostsTable)
        .where(inArray(repostsTable.postId, postIds))
        .execute();
      for (const row of repostRows) {
        const count = repostCountsByPostId.get(row.postId) ?? 0;
        repostCountsByPostId.set(row.postId, count + 1);
      }
    }

    // Fetch emoji reaction counts for all posts
    const reactionCountsByPostId = new Map<string, Map<string, number>>();
    if (postIds.length > 0) {
      const emojiRows = await DB.getInstance()
        .select({ postId: emojiReactsTable.postId, emoji: emojiReactsTable.emoji })
        .from(emojiReactsTable)
        .where(inArray(emojiReactsTable.postId, postIds))
        .execute();
      for (const row of emojiRows) {
        const postReactions = reactionCountsByPostId.get(row.postId) ?? new Map<string, number>();
        const count = postReactions.get(row.emoji) ?? 0;
        postReactions.set(row.emoji, count + 1);
        reactionCountsByPostId.set(row.postId, postReactions);
      }
    }

    return RA.ok(
      rows.map((row) => {
        const images = imagesByPostId.get(row.posts.postId) ?? [];
        const likeCount = likeCountsByPostId.get(row.posts.postId) ?? 0;
        const repostCount = repostCountsByPostId.get(row.posts.postId) ?? 0;
        const postReactions = reactionCountsByPostId.get(row.posts.postId);
        const reactionCounts = postReactions
          ? Array.from(postReactions.entries()).map(([emoji, count]) => ({ emoji, count }))
          : [];
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
          reactionCounts,
        };
      }),
    );
  };
  return { resolve };
});

export const PgLocalPostsResolver = {
  getInstance,
} as const;
