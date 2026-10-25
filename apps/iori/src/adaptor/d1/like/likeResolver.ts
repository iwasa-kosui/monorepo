import { RA } from '@iwasa-kosui/result';
import { and, eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Like, LikeResolver, LocalLike, RemoteLike } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { likesTable, localLikesTable, remoteLikesTable } from '../schema.ts';

export const createD1LikeResolver = (db: IoriD1Db): LikeResolver => ({
  resolve: async ({ actorId, postId }) => {
    const [row, ...rest] = await db.select()
      .from(likesTable)
      .leftJoin(localLikesTable, eq(likesTable.likeId, localLikesTable.likeId))
      .leftJoin(remoteLikesTable, eq(likesTable.likeId, remoteLikesTable.likeId))
      .where(and(eq(likesTable.actorId, actorId), eq(likesTable.postId, postId)));
    if (row === undefined) return RA.ok(undefined);
    if (rest.length > 0) throw new Error('Inconsistent state: multiple like records found');
    const shared = {
      likeId: LikeId.orThrow(row.likes.likeId),
      actorId: row.likes.actorId as ActorId,
      postId: PostId.orThrow(row.likes.postId),
    };
    if (row.remote_likes !== null) {
      const remoteLike: RemoteLike = {
        ...shared,
        type: 'remote',
        likeActivityUri: row.remote_likes.likeActivityUri,
      };
      return RA.ok(remoteLike as Like);
    }
    const localLike: LocalLike = { ...shared, type: 'local' };
    return RA.ok(localLike as Like);
  },
});
