import { RA } from '@iwasa-kosui/result';
import { and, inArray, isNull, sql } from 'drizzle-orm';

import type { PostContentsResolverByPostIds } from '../../../domain/interestSource/interestMaterial.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { idsJson } from '../idsJson.ts';
import { postsTable } from '../schema.ts';

export const createD1PostContentsResolverByPostIds = (db: IoriD1Db): PostContentsResolverByPostIds => ({
  resolve: async (postIds) => {
    if (postIds.length === 0) return RA.ok([]);
    const rows = await db.select({ postId: postsTable.postId, content: postsTable.content }).from(postsTable)
      .where(and(
        inArray(postsTable.postId, sql`(select value from json_each(${idsJson(postIds)}))`),
        isNull(postsTable.deletedAt),
      ));
    return RA.ok(rows.map((row) => ({ postId: PostId.orThrow(row.postId), content: row.content })));
  },
});
