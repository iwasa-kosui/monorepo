import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, notInArray, or } from 'drizzle-orm';

import { Instant } from '../../../domain/instant/instant.ts';
import type { OwnLikeContentsResolverByActorId } from '../../../domain/interestSource/interestMaterial.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { IoriD1Db } from '../client.ts';
import { likesTable, postsTable, remotePostsTable } from '../schema.ts';

export const createD1OwnLikeContentsResolverByActorId = (db: IoriD1Db): OwnLikeContentsResolverByActorId => ({
  resolve: async (actorId) => {
    const rows = await db.select({
      likeId: likesTable.likeId,
      content: postsTable.content,
      createdAt: likesTable.createdAt,
    }).from(likesTable)
      .innerJoin(postsTable, eq(likesTable.postId, postsTable.postId))
      .leftJoin(remotePostsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(
        eq(likesTable.actorId, actorId),
        isNull(postsTable.deletedAt),
        or(isNull(remotePostsTable.visibility), notInArray(remotePostsTable.visibility, ['private', 'direct'])),
      ));
    return RA.ok(rows.map((row) => ({
      likeId: LikeId.orThrow(row.likeId),
      content: row.content,
      createdAt: Instant.orThrow(row.createdAt.getTime()),
    })));
  },
});
