import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Like, LikeResolver, LocalLike, RemoteLike } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable, localLikesTable, remoteLikesTable } from '../schema.ts';

const getInstance = singleton((): LikeResolver => ({
  resolve: async (agg: { actorId: ActorId; postId: PostId }) => {
    const [row, ...rest] = await DB.getInstance()
      .select({
        likes: likesTable,
        local_likes: localLikesTable,
        remote_likes: remoteLikesTable,
      })
      .from(likesTable)
      .leftJoin(localLikesTable, eq(likesTable.likeId, localLikesTable.likeId))
      .leftJoin(remoteLikesTable, eq(likesTable.likeId, remoteLikesTable.likeId))
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

    const likeId = LikeId.orThrow(row.likes.likeId);
    const actorId = row.likes.actorId as ActorId;
    const postId = PostId.orThrow(row.likes.postId);

    if (row.remote_likes) {
      const remoteLike: RemoteLike = {
        type: 'remote',
        likeId,
        actorId,
        postId,
        likeActivityUri: row.remote_likes.likeActivityUri,
      };
      return RA.ok(remoteLike as Like);
    }

    const localLike: LocalLike = {
      type: 'local',
      likeId,
      actorId,
      postId,
    };
    return RA.ok(localLike as Like);
  },
}));

export const PgLikeResolver = {
  getInstance,
} as const;
