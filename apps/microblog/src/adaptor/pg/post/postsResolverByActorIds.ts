import { LocalPost, RemotePost, type PostsResolverByActorIds } from '../../../domain/post/post.ts';
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Post, type PostResolver, type PostsResolverByActorId } from "../../../domain/post/post.ts";
import type { PostId } from "../../../domain/post/postId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { actorsTable, localActorsTable, localPostsTable, postsTable, remoteActorsTable, remotePostsTable, usersTable } from "../schema.ts";
import { RA } from "@iwasa-kosui/result";
import type { ActorId } from "../../../domain/actor/actorId.ts";
import { Username } from '../../../domain/user/username.ts';
import { Instant } from '../../../domain/instant/instant.ts';

const getInstance = singleton((): PostsResolverByActorIds => {
  const resolve = async ({ actorIds, createdAt }: { actorIds: ActorId[], createdAt: Instant | undefined }) => {
    const rows = await DB.getInstance().select()
      .from(postsTable)
      .leftJoin(
        localPostsTable,
        eq(postsTable.postId, localPostsTable.postId)
      )
      .leftJoin(
        remotePostsTable,
        eq(postsTable.postId, remotePostsTable.postId)
      )
      .leftJoin(
        actorsTable,
        eq(postsTable.actorId, actorsTable.actorId)
      )
      .leftJoin(
        localActorsTable,
        eq(actorsTable.actorId, localActorsTable.actorId)
      )
      .leftJoin(
        remoteActorsTable,
        eq(actorsTable.actorId, remoteActorsTable.actorId)
      )
      .leftJoin(
        usersTable,
        eq(localActorsTable.userId, usersTable.userId)
      )
      .where(createdAt ? and(
        inArray(postsTable.actorId, actorIds),
        lt(postsTable.createdAt, Instant.toDate(createdAt)),
      ) : inArray(postsTable.actorId, actorIds))
      .limit(10)
      .orderBy(desc(postsTable.createdAt))
      .execute();
    return RA.ok(rows.map(row => {
      if (row.local_posts) {
        const post: LocalPost = LocalPost.orThrow({
          postId: row.posts.postId,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          userId: row.local_posts.userId,
          type: 'local',
        });
        return {
          ...post,
          username: Username.orThrow(row.users!.username),
          logoUri: row.actors!.logoUri ?? undefined,
        };
      }
      if (row.remote_posts) {
        const post: Post = RemotePost.orThrow({
          postId: row.posts.postId,
          uri: row.remote_posts.uri,
          actorId: row.posts.actorId,
          content: row.posts.content,
          createdAt: row.posts.createdAt.getTime(),
          type: 'remote',
        });
        return {
          ...post,
          username: Username.orThrow(row.remote_actors!.username!),
          logoUri: row.actors!.logoUri ?? undefined,
        }
      }
      throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
    }))
  }
  return { resolve };
})

export const PgPostsResolverByActorIds = {
  getInstance,
} as const;
