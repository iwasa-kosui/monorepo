import { RA } from '@iwasa-kosui/result';
import { eq } from 'drizzle-orm';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { Like, LikesResolverByPostId, LocalLike, RemoteLike } from '../../../domain/like/like.ts';
import { LikeId } from '../../../domain/like/likeId.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { singleton } from '../../../helper/singleton.ts';
import { DB } from '../db.ts';
import { likesTable, localLikesTable, remoteLikesTable } from '../schema.ts';

const getInstance = singleton((): LikesResolverByPostId => ({
  resolve: async ({ postId }: { postId: PostId }) => {
    const rows = await DB.getInstance()
      .select({
        likes: likesTable,
        local_likes: localLikesTable,
        remote_likes: remoteLikesTable,
      })
      .from(likesTable)
      .leftJoin(localLikesTable, eq(likesTable.likeId, localLikesTable.likeId))
      .leftJoin(remoteLikesTable, eq(likesTable.likeId, remoteLikesTable.likeId))
      .where(eq(likesTable.postId, postId))
      .execute();

    return RA.ok(
      rows.map((row): Like => {
        const likeId = LikeId.orThrow(row.likes.likeId);
        const actorId = row.likes.actorId as ActorId;
        const pId = row.likes.postId as PostId;

        if (row.remote_likes) {
          const remoteLike: RemoteLike = {
            type: 'remote',
            likeId,
            actorId,
            postId: pId,
            likeActivityUri: row.remote_likes.likeActivityUri,
          };
          return remoteLike;
        }

        const localLike: LocalLike = {
          type: 'local',
          likeId,
          actorId,
          postId: pId,
        };
        return localLike;
      }),
    );
  },
}));

export const PgLikesResolverByPostId = {
  getInstance,
} as const;
