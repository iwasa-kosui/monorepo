import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Like, LikesResolverByPostId } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { IoriD1Db } from '../client.ts';
import { likesTable, localLikesTable, remoteLikesTable } from '../schema.ts';

export const createD1LikesResolverByPostId = (db: IoriD1Db): LikesResolverByPostId => ({
  resolve: async ({ postId }) => {
    const rows = await db.select({
      likes: likesTable,
      local_likes: localLikesTable,
      remote_likes: remoteLikesTable,
    }).from(likesTable)
      .leftJoin(localLikesTable, eq(likesTable.likeId, localLikesTable.likeId))
      .leftJoin(remoteLikesTable, eq(likesTable.likeId, remoteLikesTable.likeId))
      .where(eq(likesTable.postId, postId));

    return RA.ok(rows.map((row): Like => {
      const base = {
        likeId: LikeId.orThrow(row.likes.likeId),
        actorId: row.likes.actorId as ActorId,
        postId: row.likes.postId as PostId,
      };
      return row.remote_likes === null
        ? { ...base, type: 'local' }
        : { ...base, type: 'remote', likeActivityUri: row.remote_likes.likeActivityUri };
    }));
  },
});
