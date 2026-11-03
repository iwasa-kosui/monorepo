import { RA } from '@iwasa-kosui/result';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import type { LikedPostIdsResolverByActorIdWithPagination } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { pageConditions, pageOrderBy } from '../pageCondition.ts';
import { likesTable, postsTable } from '../schema.ts';

const cursorLike = alias(likesTable, 'cursor_like');

export const createD1LikedPostIdsResolverByActorIdWithPagination = (
  db: IoriD1Db,
): LikedPostIdsResolverByActorIdWithPagination => ({
  resolve: async ({ actorId, page }) => {
    const columns = { createdAt: likesTable.createdAt, id: likesTable.likeId };
    // 他のアクターの like の ID を位置に使っても、その行の時刻を引かない
    const cursorOf = (id: string) =>
      sql`select ${cursorLike.createdAt}, ${cursorLike.likeId} from ${likesTable} ${cursorLike}
        where ${cursorLike.likeId} = ${id} and ${cursorLike.actorId} = ${actorId}`;
    const rows = await db.select({ likeId: likesTable.likeId, postId: likesTable.postId })
      .from(likesTable)
      .innerJoin(postsTable, eq(likesTable.postId, postsTable.postId))
      .where(and(
        eq(likesTable.actorId, actorId),
        isNull(postsTable.deletedAt),
        ...pageConditions(page, columns, cursorOf),
      ))
      .orderBy(...pageOrderBy(page, columns))
      .limit(page.limit);
    return RA.ok(rows.map((row) => ({ likeId: LikeId.orThrow(row.likeId), postId: PostId.orThrow(row.postId) })));
  },
});
