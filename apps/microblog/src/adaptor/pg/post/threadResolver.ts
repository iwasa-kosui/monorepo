import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import { LocalPost, type PostImage, type PostQuery, type ReactionCount, RemotePost } from '../../../domain/post/post.ts';
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
  { currentPost: PostQuery | null; ancestors: PostQuery[]; descendants: PostQuery[] }
>;

const getInstance = singleton((): ThreadResolver => {
  const resolve = async ({ postId }: { postId: PostId }) => {
    // Find the current post by postId
    const currentPost = await getPostById(postId);
    const ancestors: PostQuery[] = [];
    const descendants: PostQuery[] = [];

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

      // Fetch images and engagement counts for replies
      const replyPostIds = localReplyRows.map((row) => row.posts.postId);
      const [replyImagesByPostId, replyEngagementCounts] = await Promise.all([
        getPostImagesByIds(replyPostIds),
        getEngagementCountsForPosts(replyPostIds),
      ]);

      for (const row of localReplyRows) {
        const images = replyImagesByPostId.get(row.posts.postId) ?? [];
        const engagementCounts = replyEngagementCounts.get(row.posts.postId) ?? {
          likeCount: 0,
          repostCount: 0,
          reactionCounts: [],
        };
        const post: PostQuery = {
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
          ...engagementCounts,
        };
        descendants.push(post);
      }
    }

    return RA.ok({ currentPost, ancestors, descendants });
  };

  return { resolve };
});

async function getPostById(postId: PostId): Promise<PostQuery | null> {
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
    const [images, engagementCounts] = await Promise.all([
      getPostImages(row.posts.postId),
      getEngagementCountsForPost(row.posts.postId),
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
      ...engagementCounts,
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
    const [images, engagementCounts] = await Promise.all([
      getPostImages(row.posts.postId),
      getEngagementCountsForPost(row.posts.postId),
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
      ...engagementCounts,
    };
  }

  return null;
}

async function getPostByUri(uri: string): Promise<PostQuery | null> {
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
    const [images, engagementCounts] = await Promise.all([
      getPostImages(row.posts.postId),
      getEngagementCountsForPost(row.posts.postId),
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
      ...engagementCounts,
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
      const [images, engagementCounts] = await Promise.all([
        getPostImages(row.posts.postId),
        getEngagementCountsForPost(row.posts.postId),
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
        ...engagementCounts,
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

type EngagementCounts = {
  likeCount: number;
  repostCount: number;
  reactionCounts: ReactionCount[];
};

async function getEngagementCountsForPost(postId: string): Promise<EngagementCounts> {
  const [likeRows, repostRows, emojiRows] = await Promise.all([
    DB.getInstance()
      .select({ postId: likesTable.postId })
      .from(likesTable)
      .where(eq(likesTable.postId, postId))
      .execute(),
    DB.getInstance()
      .select({ postId: repostsTable.postId })
      .from(repostsTable)
      .where(eq(repostsTable.postId, postId))
      .execute(),
    DB.getInstance()
      .select({ emoji: emojiReactsTable.emoji })
      .from(emojiReactsTable)
      .where(eq(emojiReactsTable.postId, postId))
      .execute(),
  ]);

  const emojiCountMap = new Map<string, number>();
  for (const row of emojiRows) {
    const count = emojiCountMap.get(row.emoji) ?? 0;
    emojiCountMap.set(row.emoji, count + 1);
  }

  return {
    likeCount: likeRows.length,
    repostCount: repostRows.length,
    reactionCounts: Array.from(emojiCountMap.entries()).map(([emoji, count]) => ({ emoji, count })),
  };
}

async function getEngagementCountsForPosts(postIds: string[]): Promise<Map<string, EngagementCounts>> {
  if (postIds.length === 0) {
    return new Map();
  }

  const [likeRows, repostRows, emojiRows] = await Promise.all([
    DB.getInstance()
      .select({ postId: likesTable.postId })
      .from(likesTable)
      .where(inArray(likesTable.postId, postIds))
      .execute(),
    DB.getInstance()
      .select({ postId: repostsTable.postId })
      .from(repostsTable)
      .where(inArray(repostsTable.postId, postIds))
      .execute(),
    DB.getInstance()
      .select({ postId: emojiReactsTable.postId, emoji: emojiReactsTable.emoji })
      .from(emojiReactsTable)
      .where(inArray(emojiReactsTable.postId, postIds))
      .execute(),
  ]);

  const likeCountsByPostId = new Map<string, number>();
  for (const row of likeRows) {
    const count = likeCountsByPostId.get(row.postId) ?? 0;
    likeCountsByPostId.set(row.postId, count + 1);
  }

  const repostCountsByPostId = new Map<string, number>();
  for (const row of repostRows) {
    const count = repostCountsByPostId.get(row.postId) ?? 0;
    repostCountsByPostId.set(row.postId, count + 1);
  }

  const emojiCountsByPostId = new Map<string, Map<string, number>>();
  for (const row of emojiRows) {
    const postReactions = emojiCountsByPostId.get(row.postId) ?? new Map<string, number>();
    const count = postReactions.get(row.emoji) ?? 0;
    postReactions.set(row.emoji, count + 1);
    emojiCountsByPostId.set(row.postId, postReactions);
  }

  const result = new Map<string, EngagementCounts>();
  for (const postId of postIds) {
    const postReactions = emojiCountsByPostId.get(postId);
    result.set(postId, {
      likeCount: likeCountsByPostId.get(postId) ?? 0,
      repostCount: repostCountsByPostId.get(postId) ?? 0,
      reactionCounts: postReactions
        ? Array.from(postReactions.entries()).map(([emoji, count]) => ({ emoji, count }))
        : [],
    });
  }

  return result;
}

export const PgThreadResolver = {
  getInstance,
} as const;
