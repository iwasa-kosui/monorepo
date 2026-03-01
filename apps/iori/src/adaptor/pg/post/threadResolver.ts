import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import type { LinkPreview } from '../../../domain/linkPreview/linkPreview.ts';
import { LocalPost, type PostImage, type PostWithAuthor, RemotePost } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
import { Env } from '../../../env.ts';
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

export type ThreadResolver = Agg.Resolver<
  { postId: PostId },
  { currentPost: PostWithAuthor | null; ancestors: PostWithAuthor[]; descendants: PostWithAuthor[] }
>;

const getInstance = singleton((): ThreadResolver => {
  const resolve = async ({ postId }: { postId: PostId }) => {
    // Find the current post by postId
    const currentPost = await getPostById(postId);
    const ancestors: PostWithAuthor[] = [];
    const descendants: PostWithAuthor[] = [];

    // Get ancestor posts (follow inReplyToUri chain)
    let currentInReplyToUri: string | null = null;

    // First, get the inReplyToUri of the current post
    if (currentPost) {
      if (currentPost.type === 'local') {
        const localPostRow = await DB.getInstance()
          .select({ inReplyToUri: localPostsTable.inReplyToUri })
          .from(localPostsTable)
          .where(eq(localPostsTable.postId, currentPost.postId))
          .execute();
        currentInReplyToUri = localPostRow[0]?.inReplyToUri ?? null;
      } else if (currentPost.type === 'remote') {
        const remotePostRow = await DB.getInstance()
          .select({ inReplyToUri: remotePostsTable.inReplyToUri })
          .from(remotePostsTable)
          .where(eq(remotePostsTable.postId, currentPost.postId))
          .execute();
        currentInReplyToUri = remotePostRow[0]?.inReplyToUri ?? null;
      }
    }

    // Traverse ancestor chain
    while (currentInReplyToUri) {
      const ancestorPost = await getPostByUri(currentInReplyToUri);
      if (!ancestorPost) break;

      ancestors.unshift(ancestorPost);

      // Get the next inReplyToUri
      if (ancestorPost.type === 'local') {
        const localPostRow = await DB.getInstance()
          .select({ inReplyToUri: localPostsTable.inReplyToUri })
          .from(localPostsTable)
          .where(eq(localPostsTable.postId, ancestorPost.postId))
          .execute();
        currentInReplyToUri = localPostRow[0]?.inReplyToUri ?? null;
      } else if (ancestorPost.type === 'remote') {
        const remotePostRow = await DB.getInstance()
          .select({ inReplyToUri: remotePostsTable.inReplyToUri })
          .from(remotePostsTable)
          .where(eq(remotePostsTable.postId, ancestorPost.postId))
          .execute();
        currentInReplyToUri = remotePostRow[0]?.inReplyToUri ?? null;
      } else {
        currentInReplyToUri = null;
      }
    }

    // Get descendant posts - need to find posts that reply to this post
    // We need the URI of the current post to find replies
    if (currentPost) {
      const currentPostUris: string[] = [];

      // Get the URI(s) that could be used as inReplyToUri
      if (currentPost.type === 'remote') {
        currentPostUris.push(currentPost.uri);
      } else if (currentPost.type === 'local') {
        // For local posts, construct the URI that would be used as inReplyToUri
        // The format is: {ORIGIN}/users/{username}/posts/{postId}
        const { ORIGIN } = Env.getInstance();
        const localPostUri = `${ORIGIN}/users/${currentPost.username}/posts/${currentPost.postId}`;
        currentPostUris.push(localPostUri);
      }

      // If we don't have any URIs to search for, skip descendant lookup
      if (currentPostUris.length === 0) {
        return RA.ok({ currentPost, ancestors, descendants });
      }

      // Get local replies
      const localReplyRows = await DB.getInstance()
        .select()
        .from(localPostsTable)
        .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
        .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
        .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
        .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
        .where(
          and(
            isNull(postsTable.deletedAt),
            or(
              ...currentPostUris.map((uri) => eq(localPostsTable.inReplyToUri, uri)),
            ),
          ),
        )
        .execute();

      // Fetch images and stats for replies
      const replyPostIds = localReplyRows.map((row) => row.posts.postId);
      const [replyImagesByPostId, replyStatsByPostId] = await Promise.all([
        getPostImagesByIds(replyPostIds),
        getPostStatsBatch(replyPostIds),
      ]);

      for (const row of localReplyRows) {
        const images = replyImagesByPostId.get(row.posts.postId) ?? [];
        const stats = replyStatsByPostId.get(row.posts.postId)
          ?? { likeCount: 0, repostCount: 0, reactions: [], linkPreviews: [] };
        const post: PostWithAuthor = {
          ...LocalPost.orThrow({
            postId: row.posts.postId,
            actorId: row.posts.actorId,
            content: row.posts.content,
            createdAt: row.posts.createdAt.getTime(),
            userId: row.local_posts.userId,
            inReplyToUri: row.local_posts.inReplyToUri,
            type: 'local',
          }),
          username: Username.orThrow(row.users.username),
          logoUri: row.actors.logoUri ?? undefined,
          liked: false,
          reposted: false,
          images,
          likeCount: stats.likeCount,
          repostCount: stats.repostCount,
          reactions: stats.reactions,
          linkPreviews: stats.linkPreviews,
        };
        descendants.push(post);
      }
    }

    return RA.ok({ currentPost, ancestors, descendants });
  };

  return { resolve };
});

async function getPostById(postId: PostId): Promise<PostWithAuthor | null> {
  // Try to find as local post
  const localRow = await DB.getInstance()
    .select()
    .from(localPostsTable)
    .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
    .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
    .where(
      and(
        eq(localPostsTable.postId, postId),
        isNull(postsTable.deletedAt),
      ),
    )
    .limit(1)
    .execute();

  if (localRow.length > 0) {
    const row = localRow[0];
    const [images, stats] = await Promise.all([
      getPostImages(row.posts.postId),
      getPostStats(row.posts.postId),
    ]);
    return {
      ...LocalPost.orThrow({
        postId: row.posts.postId,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        userId: row.local_posts.userId,
        inReplyToUri: row.local_posts.inReplyToUri,
        type: 'local',
      }),
      username: Username.orThrow(row.users.username),
      logoUri: row.actors.logoUri ?? undefined,
      liked: false,
      reposted: false,
      images,
      likeCount: stats.likeCount,
      repostCount: stats.repostCount,
      reactions: stats.reactions,
      linkPreviews: stats.linkPreviews,
    };
  }

  // Try to find as remote post
  const remoteRow = await DB.getInstance()
    .select()
    .from(remotePostsTable)
    .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
    .where(
      and(
        eq(remotePostsTable.postId, postId),
        isNull(postsTable.deletedAt),
      ),
    )
    .limit(1)
    .execute();

  if (remoteRow.length > 0) {
    const row = remoteRow[0];
    const [images, stats] = await Promise.all([
      getPostImages(row.posts.postId),
      getPostStats(row.posts.postId),
    ]);
    return {
      ...RemotePost.orThrow({
        postId: row.posts.postId,
        uri: row.remote_posts.uri,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        inReplyToUri: row.remote_posts.inReplyToUri,
        type: 'remote',
      }),
      username: Username.orThrow(row.remote_actors?.username ?? 'unknown'),
      logoUri: row.actors.logoUri ?? undefined,
      liked: false,
      reposted: false,
      images,
      likeCount: stats.likeCount,
      repostCount: stats.repostCount,
      reactions: stats.reactions,
      linkPreviews: stats.linkPreviews,
    };
  }

  return null;
}

async function getPostByUri(uri: string): Promise<PostWithAuthor | null> {
  // Try to find as remote post first
  const remoteRow = await DB.getInstance()
    .select()
    .from(remotePostsTable)
    .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
    .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
    .leftJoin(remoteActorsTable, eq(actorsTable.actorId, remoteActorsTable.actorId))
    .where(
      and(
        eq(remotePostsTable.uri, uri),
        isNull(postsTable.deletedAt),
      ),
    )
    .limit(1)
    .execute();

  if (remoteRow.length > 0) {
    const row = remoteRow[0];
    const [images, stats] = await Promise.all([
      getPostImages(row.posts.postId),
      getPostStats(row.posts.postId),
    ]);
    return {
      ...RemotePost.orThrow({
        postId: row.posts.postId,
        uri: row.remote_posts.uri,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        inReplyToUri: row.remote_posts.inReplyToUri,
        type: 'remote',
      }),
      username: Username.orThrow(row.remote_actors?.username ?? 'unknown'),
      logoUri: row.actors.logoUri ?? undefined,
      liked: false,
      reposted: false,
      images,
      likeCount: stats.likeCount,
      repostCount: stats.repostCount,
      reactions: stats.reactions,
      linkPreviews: stats.linkPreviews,
    };
  }

  // Try to find as local post by extracting postId from URI
  // Local post URIs look like: https://example.com/users/{username}/posts/{postId}
  const postIdMatch = uri.match(/\/posts\/([a-f0-9-]+)$/i);
  if (postIdMatch) {
    const extractedPostId = postIdMatch[1];
    const localRow = await DB.getInstance()
      .select()
      .from(localPostsTable)
      .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(
        and(
          eq(localPostsTable.postId, extractedPostId),
          isNull(postsTable.deletedAt),
        ),
      )
      .limit(1)
      .execute();

    if (localRow.length > 0) {
      const row = localRow[0];
      const [images, stats] = await Promise.all([
        getPostImages(row.posts.postId),
        getPostStats(row.posts.postId),
      ]);
      return {
        ...LocalPost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          userId: row.local_posts.userId,
          inReplyToUri: row.local_posts.inReplyToUri,
          type: 'local',
        }),
        username: Username.orThrow(row.users.username),
        logoUri: row.actors.logoUri ?? undefined,
        liked: false,
        reposted: false,
        images,
        likeCount: stats.likeCount,
        repostCount: stats.repostCount,
        reactions: stats.reactions,
        linkPreviews: stats.linkPreviews,
      };
    }
  }

  return null;
}

async function getPostImages(postId: string): Promise<PostImage[]> {
  const imageRows = await DB.getInstance()
    .select()
    .from(postImagesTable)
    .where(eq(postImagesTable.postId, postId))
    .execute();

  return imageRows.map((row) => ({
    url: row.url,
    altText: row.altText,
  }));
}

async function getPostImagesByIds(postIds: string[]): Promise<Map<string, PostImage[]>> {
  if (postIds.length === 0) {
    return new Map();
  }

  const imageRows = await DB.getInstance()
    .select()
    .from(postImagesTable)
    .execute();

  const imagesByPostId = new Map<string, PostImage[]>();
  for (const imageRow of imageRows) {
    if (postIds.includes(imageRow.postId)) {
      const existing = imagesByPostId.get(imageRow.postId) ?? [];
      existing.push({ url: imageRow.url, altText: imageRow.altText });
      imagesByPostId.set(imageRow.postId, existing);
    }
  }

  return imagesByPostId;
}

async function getPostStats(postId: string): Promise<{
  likeCount: number;
  repostCount: number;
  reactions: { emoji: string; count: number; emojiImageUrl: string | null }[];
  linkPreviews: LinkPreview[];
}> {
  const [likeCountResult, repostCountResult, reactionRows] = await Promise.all([
    DB.getInstance()
      .select({ count: sql<number>`count(*)::int` })
      .from(likesTable)
      .where(eq(likesTable.postId, postId))
      .execute(),
    DB.getInstance()
      .select({ count: sql<number>`count(*)::int` })
      .from(repostsTable)
      .where(eq(repostsTable.postId, postId))
      .execute(),
    DB.getInstance()
      .select({
        emoji: emojiReactsTable.emoji,
        emojiImageUrl: emojiReactsTable.emojiImageUrl,
        count: sql<number>`count(*)::int`,
      })
      .from(emojiReactsTable)
      .where(eq(emojiReactsTable.postId, postId))
      .groupBy(emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl)
      .execute(),
  ]);

  return {
    likeCount: likeCountResult[0]?.count ?? 0,
    repostCount: repostCountResult[0]?.count ?? 0,
    reactions: reactionRows.map((row) => ({
      emoji: row.emoji,
      count: row.count,
      emojiImageUrl: row.emojiImageUrl,
    })),
    linkPreviews: [],
  };
}

async function getPostStatsBatch(postIds: string[]): Promise<
  Map<
    string,
    {
      likeCount: number;
      repostCount: number;
      reactions: { emoji: string; count: number; emojiImageUrl: string | null }[];
      linkPreviews: LinkPreview[];
    }
  >
> {
  if (postIds.length === 0) {
    return new Map();
  }

  const [likeCountRows, repostCountRows, reactionRows] = await Promise.all([
    DB.getInstance()
      .select({
        postId: likesTable.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(likesTable)
      .where(inArray(likesTable.postId, postIds))
      .groupBy(likesTable.postId)
      .execute(),
    DB.getInstance()
      .select({
        postId: repostsTable.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(repostsTable)
      .where(inArray(repostsTable.postId, postIds))
      .groupBy(repostsTable.postId)
      .execute(),
    DB.getInstance()
      .select({
        postId: emojiReactsTable.postId,
        emoji: emojiReactsTable.emoji,
        emojiImageUrl: emojiReactsTable.emojiImageUrl,
        count: sql<number>`count(*)::int`,
      })
      .from(emojiReactsTable)
      .where(inArray(emojiReactsTable.postId, postIds))
      .groupBy(emojiReactsTable.postId, emojiReactsTable.emoji, emojiReactsTable.emojiImageUrl)
      .execute(),
  ]);

  const result = new Map<
    string,
    {
      likeCount: number;
      repostCount: number;
      reactions: { emoji: string; count: number; emojiImageUrl: string | null }[];
      linkPreviews: LinkPreview[];
    }
  >();

  for (const postId of postIds) {
    result.set(postId, { likeCount: 0, repostCount: 0, reactions: [], linkPreviews: [] });
  }

  for (const row of likeCountRows) {
    const existing = result.get(row.postId);
    if (existing) {
      existing.likeCount = row.count;
    }
  }

  for (const row of repostCountRows) {
    const existing = result.get(row.postId);
    if (existing) {
      existing.repostCount = row.count;
    }
  }

  for (const row of reactionRows) {
    const existing = result.get(row.postId);
    if (existing) {
      existing.reactions.push({
        emoji: row.emoji,
        count: row.count,
        emojiImageUrl: row.emojiImageUrl,
      });
    }
  }

  return result;
}

export const PgThreadResolver = {
  getInstance,
} as const;
