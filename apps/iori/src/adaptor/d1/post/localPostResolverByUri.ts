import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull } from 'drizzle-orm';

import { LocalPost, type LocalPostResolverByUri } from '../../../domain/post/post.ts';
import type { IoriD1Db } from '../client.ts';
import { localPostsTable, postsTable } from '../schema.ts';

export const createD1LocalPostResolverByUri = (db: IoriD1Db, origin: string): LocalPostResolverByUri => ({
  resolve: async ({ uri }) => {
    const parsed = new URL(uri);
    if (parsed.origin !== new URL(origin).origin) return RA.ok(undefined);
    const match = parsed.pathname.match(/^\/users\/[^/]+\/posts\/([^/]+)$/);
    if (match === null) return RA.ok(undefined);
    const [row] = await db.select().from(localPostsTable)
      .innerJoin(postsTable, eq(localPostsTable.postId, postsTable.postId))
      .where(and(eq(localPostsTable.postId, match[1]), isNull(postsTable.deletedAt))).limit(1);
    return RA.ok(
      row === undefined ? undefined : LocalPost.orThrow({
        type: 'local',
        postId: row.posts.postId,
        actorId: row.posts.actorId,
        content: row.posts.content,
        createdAt: row.posts.createdAt.getTime(),
        userId: row.local_posts.userId,
        inReplyToUri: row.local_posts.inReplyToUri,
      }),
    );
  },
});
