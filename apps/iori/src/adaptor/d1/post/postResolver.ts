import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { LocalPost, type Post, type PostResolver, RemotePost } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

const toPost = (row: {
  posts: { postId: string; actorId: string; content: string; createdAt: Date };
  local_posts: { userId: string; inReplyToUri: string | null } | null;
  remote_posts: { uri: string; inReplyToUri: string | null } | null;
}): Post => {
  if (row.local_posts !== null) {
    return LocalPost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      userId: row.local_posts.userId,
      inReplyToUri: row.local_posts.inReplyToUri,
      type: 'local',
    });
  }
  if (row.remote_posts !== null) {
    return RemotePost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      uri: row.remote_posts.uri,
      inReplyToUri: row.remote_posts.inReplyToUri,
      type: 'remote',
    });
  }
  throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
};

export const createD1PostResolver = (db: IoriD1Db): PostResolver => ({
  resolve: (postId) =>
    RA.flow(
      fromD1(async () => {
        const [row, ...rest] = await db.select().from(postsTable)
          .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
          .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
          .where(and(eq(postsTable.postId, postId), isNull(postsTable.deletedAt)));
        if (row === undefined) return undefined;
        if (rest.length > 0) throw new Error(`Multiple posts found with the same ID: ${postId}`);
        return toPost(row);
      }),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
