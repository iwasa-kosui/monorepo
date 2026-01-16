import { and, eq, isNull } from "drizzle-orm";
import { LocalPost, Post, RemotePost, type PostResolver } from "../../../domain/post/post.ts";
import type { PostId } from "../../../domain/post/postId.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { localPostsTable, postsTable, remotePostsTable } from "../schema.ts";
import { RA } from "@iwasa-kosui/result";

const getInstance = singleton((): PostResolver => {
  const resolve = async (postId: PostId) => {
    const [row, ...rest] = await DB.getInstance().select()
      .from(postsTable)
      .leftJoin(
        localPostsTable,
        eq(postsTable.postId, localPostsTable.postId)
      )
      .leftJoin(
        remotePostsTable,
        eq(postsTable.postId, remotePostsTable.postId)
      )
      .where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt)))
      .execute();

    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error(`Multiple posts found with the same ID: ${postId}`);
    }

    if (row.local_posts) {
      const post: LocalPost = LocalPost.orThrow({
        postId: row.posts.postId,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        userId: row.local_posts.userId,
        type: 'local',
      });
      return RA.ok(post);
    }
    if (row.remote_posts) {
      const post: RemotePost = RemotePost.orThrow({
        postId: row.posts.postId,
        uri: row.remote_posts.uri,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        type: 'remote',
      });
      return RA.ok(post);
    }
    throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
  }
  return { resolve };
})

export const PgPostResolver = {
  getInstance,
} as const;
