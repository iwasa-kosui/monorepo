import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';

import type { LikedPostContentsResolverByLikeIds } from '../../../domain/interestSource/interestMaterial.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { likesTable, localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

export const createD1LikedPostContentsResolverByLikeIds = (db: IoriD1Db): LikedPostContentsResolverByLikeIds => ({
  resolve: async (likeIds) => {
    if (likeIds.length === 0) return RA.ok([]);
    const rows = await db.select({ likeId: likesTable.likeId, content: postsTable.content }).from(likesTable)
      .innerJoin(postsTable, eq(likesTable.postId, postsTable.postId))
      .leftJoin(remotePostsTable, eq(remotePostsTable.postId, postsTable.postId))
      .leftJoin(localPostsTable, eq(localPostsTable.postId, postsTable.postId))
      .where(and(
        inArray(likesTable.likeId, sql`(select value from json_each(${idsJson(likeIds)}))`),
        isNull(postsTable.deletedAt),
        or(isNull(remotePostsTable.visibility), notInArray(remotePostsTable.visibility, ['private', 'direct'])),
        or(isNull(localPostsTable.visibility), notInArray(localPostsTable.visibility, ['direct'])),
      ));
    return RA.ok(rows.map((row) => ({ likeId: LikeId.orThrow(row.likeId), content: row.content })));
  },
});
