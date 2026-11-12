import { RA } from '@iwasa-kosui/result';
import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';

import type { PostContentsResolverByPostIds } from '../../../domain/interestSource/interestMaterial.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { localPostsTable, postsTable, remotePostsTable } from '../schema.ts';

export const createD1PostContentsResolverByPostIds = (db: IoriD1Db): PostContentsResolverByPostIds => ({
  resolve: async (postIds) => {
    if (postIds.length === 0) return RA.ok([]);
    const rows = await db.select({ postId: postsTable.postId, content: postsTable.content }).from(postsTable)
      .leftJoin(localPostsTable, eq(localPostsTable.postId, postsTable.postId))
      .leftJoin(remotePostsTable, eq(remotePostsTable.postId, postsTable.postId))
      .where(and(
        inArray(postsTable.postId, sql`(select value from json_each(${idsJson(postIds)}))`),
        isNull(postsTable.deletedAt),
        or(isNull(localPostsTable.visibility), notInArray(localPostsTable.visibility, ['direct'])),
        or(isNull(remotePostsTable.visibility), notInArray(remotePostsTable.visibility, ['direct'])),
      ));
    return RA.ok(rows.map((row) => ({ postId: PostId.orThrow(row.postId), content: row.content })));
  },
});
