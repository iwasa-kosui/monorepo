import { RA } from '@iwasa-kosui/result';
import { desc, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Post, type PostsResolverByActorId } from '../../../domain/post/post.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';
import { LocalPost, RemotePost } from './../../../domain/post/post.ts';

const getInstance = singleton((): PostsResolverByActorId => {
  const resolve = async (actorId: ActorId) => {
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
      .where(eq(postsTable.actorId, actorId))
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
          inReplyToUri: row.local_posts.inReplyToUri,
          type: 'local',
        });
        return post;
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
        return post;
      }
      throw new Error(`Post type could not be determined for postId: ${row.posts.postId}, type: ${row.posts.type}`);
    }));
  };
  return { resolve };
});

export const PgPostsResolverByActorId = {
  getInstance,
} as const;
