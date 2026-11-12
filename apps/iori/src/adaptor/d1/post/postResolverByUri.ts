import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { type PostResolverByUri, RemotePost } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { postsTable, remotePostsTable } from '../schema.ts';
import { toVisibility } from './toVisibility.ts';

export const createD1PostResolverByUri = (db: IoriD1Db): PostResolverByUri => ({
  resolve: async ({ uri }) => {
    const [row] = await db.select().from(remotePostsTable)
      .innerJoin(postsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(eq(remotePostsTable.uri, uri), isNull(postsTable.deletedAt))).limit(1);
    return RA.ok(
      row === undefined ? undefined : RemotePost.orThrow({
        type: 'remote',
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
      }),
    );
  },
});
