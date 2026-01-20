import { RA } from '@iwasa-kosui/result';
import { randomUUID } from 'crypto';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { LocalPost, type PostsResolverByActorIds, RemotePost } from '../../../domain/post/post.ts';
import { Post } from '../../../domain/post/post.ts';
import { Username } from '../../../domain/user/username.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import {
  actorsTable,
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

const getInstance = singleton((): PostsResolverByActorIds => {
  const resolve = async (
    { actorIds, currentActorId, createdAt }: {
      actorIds: ActorId[];
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
          eq(likesTable.objectUri, remotePostsTable.uri),
          eq(likesTable.actorId, currentActorId ?? randomUUID()),
        ),
      )
      .where(and(
        inArray(postsTable.actorId, actorIds),
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
        .select({ originalPostId: repostsTable.originalPostId })
        .from(repostsTable)
        .where(
          and(
            eq(repostsTable.actorId, currentActorId),
            inArray(repostsTable.originalPostId, postIds),
          ),
        )
        .execute();
      for (const row of repostRows) {
        if (row.originalPostId) {
          repostedPostIds.add(row.originalPostId);
        }
      }
    }

    return RA.ok(rows.map(row => {
      const images = imagesByPostId.get(row.posts.postId) ?? [];
      const reposted = repostedPostIds.has(row.posts.postId);
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
          liked: false,
          reposted,
          images,
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
        if (row.remote_actors === null) {
          throw new Error(`Remote actor not found for postId: ${row.posts.postId}`);
        }
        if (row.remote_actors.username === null) {
          throw new Error(`Remote actor username is null for postId: ${row.posts.postId}`);
        }
        return {
          ...post,
          username: Username.orThrow(row.remote_actors.username),
          logoUri: row.actors!.logoUri ?? undefined,
          liked: row.likes !== null,
          reposted,
          images,
        };
      }
      throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
    }));
  };
  return { resolve };
});

export const PgPostsResolverByActorIds = {
  getInstance,
} as const;
