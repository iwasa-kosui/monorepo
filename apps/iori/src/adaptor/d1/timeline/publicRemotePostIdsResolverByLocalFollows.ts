import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, exists, isNull } from 'drizzle-orm';

import { PostId } from '../../../domain/post/postId.ts';
import type { PublicRemotePostIdsResolverByLocalFollows } from '../../../domain/timeline/publicRemotePostIdsResolverByLocalFollows.ts';
import type { IoriD1Db } from '../client.ts';
import { followsTable, localActorsTable, postsTable, remotePostsTable } from '../schema.ts';

export const createD1PublicRemotePostIdsResolverByLocalFollows = (
  db: IoriD1Db,
): PublicRemotePostIdsResolverByLocalFollows => ({
  resolve: async ({ limit }) => {
    if (limit <= 0) return RA.ok([]);
    const followedByLocalActor = exists(
      db.select({ followerId: followsTable.followerId }).from(followsTable)
        .innerJoin(localActorsTable, eq(localActorsTable.actorId, followsTable.followerId))
        .where(eq(followsTable.followingId, postsTable.actorId)),
    );
    const rows = await db.select({ postId: postsTable.postId })
      .from(postsTable)
      .innerJoin(remotePostsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(
        isNull(postsTable.deletedAt),
        eq(remotePostsTable.visibility, 'public'),
        followedByLocalActor,
      ))
      .orderBy(desc(postsTable.createdAt), desc(postsTable.postId))
      .limit(limit);
    return RA.ok(rows.map((row) => PostId.orThrow(row.postId)));
  },
});
