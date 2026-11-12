import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { LocalPost, type Post, type PostsResolverByActorId, RemotePost } from '../../../domain/post/post.ts';
import { Visibility } from '../../../domain/post/visibility.ts';
import type { IoriD1Db } from '../client.ts';
import { fromD1 } from '../query.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';
import { toVisibility } from './toVisibility.ts';

const toPost = (row: {
  posts: {
    postId: string;
    actorId: string;
    content: string;
    createdAt: Date;
    summary: string | null;
    sensitive: boolean;
  };
  local_posts: { userId: string; inReplyToUri: string | null; visibility: string; editedAt: Date | null } | null;
  remote_posts: {
    uri: string;
    url: string | null;
    inReplyToUri: string | null;
    visibility: string | null;
    editedAt: Date | null;
  } | null;
}): Post => {
  if (row.local_posts !== null) {
    return LocalPost.orThrow({
      postId: row.posts.postId,
      actorId: row.posts.actorId,
      content: row.posts.content,
      createdAt: row.posts.createdAt.getTime(),
      userId: row.local_posts.userId,
      inReplyToUri: row.local_posts.inReplyToUri,
      summary: row.posts.summary,
      sensitive: row.posts.sensitive,
      visibility: Visibility.parseOrThrow(row.local_posts.visibility),
      editedAt: row.local_posts.editedAt?.getTime(),
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
      url: row.remote_posts.url,
      inReplyToUri: row.remote_posts.inReplyToUri,
      visibility: toVisibility(row.remote_posts.visibility),
      editedAt: row.remote_posts.editedAt?.getTime() ?? null,
      summary: row.posts.summary,
      sensitive: row.posts.sensitive,
      type: 'remote',
    });
  }
  throw new Error(`Post type could not be determined for postId: ${row.posts.postId}`);
};

export const createD1PostsResolverByActorId = (db: IoriD1Db): PostsResolverByActorId => ({
  resolve: (actorId) =>
    RA.flow(
      fromD1(async () =>
        (await db.select().from(postsTable)
          .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
          .leftJoin(remotePostsTable, eq(postsTable.postId, remotePostsTable.postId))
          .where(and(
            eq(postsTable.actorId, actorId),
            isNull(postsTable.deletedAt),
            or(isNull(localPostsTable.visibility), inArray(localPostsTable.visibility, ['public', 'unlisted'])),
          ))
          .limit(10).orderBy(desc(postsTable.createdAt))).map(toPost)
      ),
      RA.mapErr((error): never => {
        throw error;
      }),
    ),
});
