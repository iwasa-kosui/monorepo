import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Like } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable } from '../schema.ts';

const getInstance = singleton(() => ({
  resolve: async (agg: { actorId: ActorId; postId: PostId }) => {
    const [row, ...rest] = await DB.getInstance()
      .select()
      .from(likesTable)
      .where(
        and(
          eq(likesTable.actorId, agg.actorId),
          eq(likesTable.postId, agg.postId),
        ),
      )
      .execute();
    if (!row) {
      return RA.ok(undefined);
    }
    if (rest.length > 0) {
      throw new Error('Inconsistent state: multiple like records found');
    }
    return RA.ok(
      Like.orThrow({
        likeId: LikeId.orThrow(row.likeId),
        actorId: row.actorId,
        postId: PostId.orThrow(row.postId),
      }),
    );
  },
}));

export const PgLikeResolver = {
  getInstance,
} as const;
