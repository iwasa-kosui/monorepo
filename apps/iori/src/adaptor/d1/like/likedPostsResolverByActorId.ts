import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { type LikedPostsResolverByActorId, LocalPost, RemotePost } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
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

export const createD1LikedPostsResolverByActorId = (
  db: IoriD1Db,
): LikedPostsResolverByActorId => ({
  resolve: async ({ actorId, currentActorId, createdAt }) => {
    const rows = await db.select().from(likesTable)
      .innerJoin(postsTable, eq(likesTable.postId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(and(
        eq(likesTable.actorId, actorId),
        isNull(postsTable.deletedAt),
        createdAt === undefined ? undefined : lt(likesTable.createdAt, new Date(createdAt)),
      ))
      .limit(20)
      .orderBy(desc(likesTable.createdAt));
    const postIds = rows.map((row) => row.posts.postId);
    if (postIds.length === 0) return RA.ok([]);

    const imageRows = await db.select().from(postImagesTable).where(inArray(postImagesTable.postId, postIds));
    const imagesByPostId = new Map<string, { url: string; altText: string | null }[]>();
    for (const image of imageRows) {
      const images = imagesByPostId.get(image.postId) ?? [];
      images.push({ url: image.url, altText: image.altText });
      imagesByPostId.set(image.postId, images);
    }

    const repostedPostIds = new Set<string>();
    if (currentActorId !== undefined) {
      const repostRows = await db.select({ postId: repostsTable.postId }).from(repostsTable)
        .where(and(eq(repostsTable.actorId, currentActorId), inArray(repostsTable.postId, postIds)));
      for (const repost of repostRows) repostedPostIds.add(repost.postId);
    }

    const [likeCounts, repostCounts, reactionRows, previewRows] = await Promise.all([
      db.select({ postId: likesTable.postId, count: sql<number>`count(*)` }).from(likesTable)
        .where(inArray(likesTable.postId, postIds)).groupBy(likesTable.postId),
      db.select({ postId: repostsTable.postId, count: sql<number>`count(*)` }).from(repostsTable)
        .where(inArray(repostsTable.postId, postIds)).groupBy(repostsTable.postId),
      db.select({
        postId: emojiReactsTable.postId,
        emoji: emojiReactsTable.emoji,
        emojiImageUrl: emojiReactsTable.emojiImageUrl,
        count: sql<number>`count(*)`,
      }).from(emojiReactsTable).where(inArray(emojiReactsTable.postId, postIds))
        .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl),
      db.select().from(linkPreviewsTable).where(inArray(linkPreviewsTable.postId, postIds)),
    ]);
    const likeCountsByPostId = new Map(likeCounts.map((row) => [row.postId, Number(row.count)]));
    const repostCountsByPostId = new Map(repostCounts.map((row) => [row.postId, Number(row.count)]));
    const reactionsByPostId = new Map<string, { emoji: string; count: number; emojiImageUrl: string | null }[]>();
    for (const reaction of reactionRows) {
      const reactions = reactionsByPostId.get(reaction.postId) ?? [];
      reactions.push({ emoji: reaction.emoji, count: Number(reaction.count), emojiImageUrl: reaction.emojiImageUrl });
      reactionsByPostId.set(reaction.postId, reactions);
    }
    const previewsByPostId = new Map<string, LinkPreview[]>();
    for (const preview of previewRows) {
      const previews = previewsByPostId.get(preview.postId) ?? [];
      previews.push(LinkPreview.orThrow({
        linkPreviewId: LinkPreviewId.orThrow(preview.linkPreviewId),
        postId: preview.postId as PostId,
        url: preview.url,
        title: preview.title,
        description: preview.description,
        imageUrl: preview.imageUrl,
        faviconUrl: preview.faviconUrl,
        siteName: preview.siteName,
        createdAt: preview.createdAt.getTime(),
      }));
      previewsByPostId.set(preview.postId, previews);
    }

    return RA.ok(rows.map((row) => {
      const post = row.local_posts !== null
        ? LocalPost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          userId: row.local_posts.userId,
          inReplyToUri: row.local_posts.inReplyToUri,
          type: 'local',
        })
        : row.remote_posts !== null
        ? RemotePost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          uri: row.remote_posts.uri,
          inReplyToUri: row.remote_posts.inReplyToUri,
          type: 'remote',
        })
        : (() => {
          throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
        })();
      const username = row.local_posts !== null ? row.users?.username : row.remote_actors?.username;
      if (username === null || username === undefined) {
        throw new Error(`Post author could not be determined for postId: ${row.posts.postId}`);
      }
      return {
        ...post,
        username: Username.orThrow(username),
        logoUri: row.actors.logoUri ?? undefined,
        liked: true,
        reposted: repostedPostIds.has(row.posts.postId),
        images: imagesByPostId.get(row.posts.postId) ?? [],
        likeCount: likeCountsByPostId.get(row.posts.postId) ?? 0,
        repostCount: repostCountsByPostId.get(row.posts.postId) ?? 0,
        reactions: reactionsByPostId.get(row.posts.postId) ?? [],
        linkPreviews: previewsByPostId.get(row.posts.postId) ?? [],
      };
    }));
  },
});
