import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import type { Agg } from '../../../domain/aggregate/index.ts';
import { LocalPost, type PostImage, type PostWithAuthor, RemotePost } from '../../../domain/post/post.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import {
  actorsTable,
  localActorsTable,
  localPostsTable,
  postImagesTable,
  postsTable,
  remoteActorsTable,
  remotePostsTable,
  usersTable,
} from '../schema.ts';

export type ThreadResolver = Agg.Resolver<
  { objectUri: string },
  { currentPost: PostWithAuthor | null; ancestors: PostWithAuthor[]; descendants: PostWithAuthor[] }
>;

const getInstance = singleton((): ThreadResolver => {
  const resolve = async ({ objectUri }: { objectUri: string }) => {
    // Find the current post by URI (either remote post URI or local post path)
    const currentPost = await getPostByUri(objectUri);
    const ancestors: PostWithAuthor[] = [];
    const descendants: PostWithAuthor[] = [];

    // Get ancestor posts (follow inReplyToUri chain)
    let currentUri: string | null = objectUri;
    while (currentUri) {
      const post = await getPostByUri(currentUri);
      if (!post) break;

      // Get the inReplyToUri for this post (check both local and remote posts)
      let inReplyToUri: string | null = null;

      if (post.type === 'local') {
        const localPostRow = await DB.getInstance()
          .select({ inReplyToUri: localPostsTable.inReplyToUri })
          .from(localPostsTable)
          .where(eq(localPostsTable.postId, post.postId))
          .execute();
        inReplyToUri = localPostRow[0]?.inReplyToUri ?? null;
      } else if (post.type === 'remote') {
        const remotePostRow = await DB.getInstance()
          .select({ inReplyToUri: remotePostsTable.inReplyToUri })
          .from(remotePostsTable)
          .where(eq(remotePostsTable.postId, post.postId))
          .execute();
        inReplyToUri = remotePostRow[0]?.inReplyToUri ?? null;
      }

      if (inReplyToUri && inReplyToUri !== objectUri) {
        const ancestorPost = await getPostByUri(inReplyToUri);
        if (ancestorPost) {
          ancestors.unshift(ancestorPost);
        }
      }
      currentUri = inReplyToUri;
    }

    // Get descendant posts (find posts that reply to this URI)
    const replyRows = await DB.getInstance()
      .select()
      .from(localPostsTable)
      .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
      .innerJoin(actorsTable, eq(postsTable.actorId, actorsTable.actorId))
      .innerJoin(localActorsTable, eq(actorsTable.actorId, localActorsTable.actorId))
      .innerJoin(usersTable, eq(localActorsTable.userId, usersTable.userId))
      .where(
        and(
          eq(localPostsTable.inReplyToUri, objectUri),
          isNull(postsTable.deletedAt),
        ),
      )
      .execute();

    // Fetch images for replies
    const replyPostIds = replyRows.map((row) => row.posts.postId);
    const replyImageRows = replyPostIds.length > 0
      ? await DB.getInstance()
        .select()
        .from(postImagesTable)
        .where(
          replyPostIds.length === 1
            ? eq(postImagesTable.postId, replyPostIds[0])
            : undefined,
        )
        .execute()
      : [];

    const replyImagesByPostId = new Map<string, PostImage[]>();
    for (const imageRow of replyImageRows) {
      if (replyPostIds.includes(imageRow.postId)) {
        const existing = replyImagesByPostId.get(imageRow.postId) ?? [];
        existing.push({ url: imageRow.url, altText: imageRow.altText });
        replyImagesByPostId.set(imageRow.postId, existing);
      }
    }

    for (const row of replyRows) {
      const images = replyImagesByPostId.get(row.posts.postId) ?? [];
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
      };
      descendants.push(post);
    }

    return RA.ok({ currentPost, ancestors, descendants });
  };

  return { resolve };
});

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
    const images = await getPostImages(row.posts.postId);
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
    };
  }

  // Try to find as local post by extracting postId from URI
  // Local post URIs look like: https://example.com/users/{username}/posts/{postId}
  const postIdMatch = uri.match(/\/posts\/([a-f0-9-]+)$/i);
  if (postIdMatch) {
    const postId = postIdMatch[1];
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
      const images = await getPostImages(row.posts.postId);
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

export const PgThreadResolver = {
  getInstance,
} as const;
