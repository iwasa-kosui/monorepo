import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Agg } from '../../../domain/aggregate/index.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../../../domain/linkPreview/linkPreviewId.ts';
import { LocalPost, type PostWithAuthor, RemotePost } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
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

export type LikedPostsResolverByActorId = Agg.Resolver<
  { actorId: ActorId; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  PostWithAuthor[]
>;

const getInstance = singleton((): LikedPostsResolverByActorId => {
  const resolve = async (
    { actorId, currentActorId, createdAt }: {
      actorId: ActorId;
      currentActorId: ActorId | undefined;
      createdAt: Instant | undefined;
    },
  ) => {
    const rows = await DB.getInstance()
      .select({
        likes: likesTable,
        posts: postsTable,
        local_posts: localPostsTable,
        remote_posts: remotePostsTable,
        actors: actorsTable,
        local_actors: localActorsTable,
        remote_actors: remoteActorsTable,
        users: usersTable,
      })
      .from(likesTable)
      .innerJoin(postsTable, eq(likesTable.postId, postsTable.postId))
      .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
      .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
      .leftJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .leftJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
      .leftJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(
        and(
          eq(likesTable.actorId, actorId),
          isNull(postsTable.deletedAt),
          createdAt ? lt(likesTable.createdAt, Instant.toDate(createdAt)) : undefined,
        ),
      )
      .limit(20)
      .orderBy(desc(likesTable.createdAt))
      .execute();

    const postIds = rows.map((row) => row.posts.postId);

    // Fetch images for all posts
    const imageRows = postIds.length > 0
      ? await DB.getInstance()
        .select()
        .from(postImagesTable)
        .where(inArray(postImagesTable.postId, postIds))
        .execute()
      : [];

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

    // Fetch link previews for all posts
    const linkPreviewsByPostId = new Map<string, LinkPreview[]>();
    if (postIds.length > 0) {
      const linkPreviewRows = await DB.getInstance()
        .select()
        .from(linkPreviewsTable)
        .where(inArray(linkPreviewsTable.postId, postIds))
        .execute();
      for (const row of linkPreviewRows) {
        const existing = linkPreviewsByPostId.get(row.postId) ?? [];
        existing.push(
          LinkPreview.orThrow({
            linkPreviewId: LinkPreviewId.orThrow(row.linkPreviewId),
            postId: row.postId as PostId,
            url: row.url,
            title: row.title,
            description: row.description,
            imageUrl: row.imageUrl,
            faviconUrl: row.faviconUrl,
            siteName: row.siteName,
            createdAt: row.createdAt.getTime(),
          }),
        );
        linkPreviewsByPostId.set(row.postId, existing);
      }
    }

    return RA.ok(
      rows.map((row) => {
        const images = imagesByPostId.get(row.posts.postId) ?? [];
        const reposted = repostedPostIds.has(row.posts.postId);
        const likeCount = likeCountsByPostId.get(row.posts.postId) ?? 0;
        const repostCount = repostCountsByPostId.get(row.posts.postId) ?? 0;
        const reactions = reactionsByPostId.get(row.posts.postId) ?? [];
        const linkPreviews = linkPreviewsByPostId.get(row.posts.postId) ?? [];

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
            liked: true,
            reposted,
            images,
            likeCount,
            repostCount,
            reactions,
            linkPreviews,
          };
        }
        if (row.remote_posts) {
          const post: RemotePost = RemotePost.orThrow({
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
            liked: true,
            reposted,
            images,
            likeCount,
            repostCount,
            reactions,
            linkPreviews,
          };
        }
        throw new Error(
          `Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`,
        );
      }),
    );
  };
  return { resolve };
});

export const PgLikedPostsResolverByActorId = {
  getInstance,
} as const;
